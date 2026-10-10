// REBOOT — relances automatiques des factures impayées.
// Appelée chaque matin par pg_cron (6h et 7h UTC) ; n'agit qu'à 8h heure de Paris.
// Niveaux : 1 = J+7 après échéance, 2 = J+15, 3 = J+30 (mise en demeure).
// Mode simulation tant que RESEND_API_KEY, EMAIL_EXPEDITEUR et RELANCES_ACTIVES=oui
// ne sont pas tous définis : rien n'est envoyé ni enregistré.
import postgres from "npm:postgres@3.4.5";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });

const NIVEAUX = [
  { niveau: 3, jours: 30 },
  { niveau: 2, jours: 15 },
  { niveau: 1, jours: 7 },
];

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function heureParis(): number {
  return Number(
    new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hour12: false, timeZone: "Europe/Paris" })
      .format(new Date()),
  );
}

function euros(n: number | string) {
  return Number(n).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

function dateFr(d: string | Date) {
  return new Date(d).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
}

function message(niveau: number, f: any) {
  const v = f.vendeur ?? {};
  const c = f.client ?? {};
  const pro = c.type === "entreprise";
  const base =
    `Facture ${f.numero} du ${dateFr(f.date_emission)}\n` +
    `Montant TTC : ${euros(f.total_ttc)}\n` +
    `Échéance : ${dateFr(f.date_echeance)} (${f.jours_retard} jours de retard)\n` +
    (v.iban ? `IBAN : ${v.iban}${v.bic ? ` — BIC : ${v.bic}` : ""}\n` : "");
  const penalites =
    `${v.penalites_texte ?? "Pénalités de retard : 3 fois le taux d'intérêt légal en vigueur"}.` +
    (pro ? "\nIndemnité forfaitaire pour frais de recouvrement : 40 € (art. L441-10 du Code de commerce)." : "");
  const signature = `\n\n${[v.prenom, v.nom].filter(Boolean).join(" ")} ${v.mention_ei ?? "EI"}\n${v.email ?? ""}`;

  if (niveau === 1) {
    return {
      sujet: `Rappel — facture ${f.numero}`,
      texte: `Bonjour,\n\nSauf erreur de ma part, la facture suivante reste impayée :\n\n${base}\n` +
        `Si le règlement est déjà parti, merci de ne pas tenir compte de ce message.${signature}`,
    };
  }
  if (niveau === 2) {
    return {
      sujet: `Relance — facture ${f.numero} impayée`,
      texte: `Bonjour,\n\nMalgré mon précédent rappel, la facture suivante n'est toujours pas réglée :\n\n${base}\n` +
        `Merci de procéder au paiement sous 8 jours.\n\n${penalites}${signature}`,
    };
  }
  return {
    sujet: `Mise en demeure — facture ${f.numero}`,
    texte: `Bonjour,\n\nPar la présente, je vous mets en demeure de régler la facture suivante sous 8 jours :\n\n${base}\n` +
      `${penalites}\n\nSans règlement dans ce délai, je me réserve le droit d'engager une procédure de recouvrement.${signature}`,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erreur: "POST uniquement" }, 405);

  // Authentification : secret du cron stocké dans Vault
  const secret = req.headers.get("x-cron-secret") ?? "";
  const [{ ok }] = await sql`select private.verifier_secret_cron(${secret}) as ok`;
  if (!ok) return json({ erreur: "non autorisé" }, 401);

  const test = new URL(req.url).searchParams.get("test") === "1";
  const heure = heureParis();
  if (!test && heure !== 8) return json({ statut: "ignoré", raison: `il est ${heure}h à Paris` });

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const expediteur = Deno.env.get("EMAIL_EXPEDITEUR");
  const actif = Deno.env.get("RELANCES_ACTIVES") === "oui" && !!resendKey && !!expediteur && !test;

  // Factures émises, non payées, échues d'au moins 7 jours
  const factures = await sql`
    select f.id, f.user_id, f.numero, f.date_emission, f.date_echeance, f.total_ttc,
           f.vendeur, f.client,
           ((now() at time zone 'Europe/Paris')::date - f.date_echeance) as jours_retard,
           coalesce((select max(r.niveau) from public.relances r where r.facture_id = f.id), 0) as niveau_envoye
    from public.factures f
    where f.type = 'facture'
      and f.statut in ('emise', 'envoyee')
      and f.date_echeance <= (now() at time zone 'Europe/Paris')::date - 7`;

  const resultats: any[] = [];
  for (const f of factures) {
    const cible = NIVEAUX.find((n) => f.jours_retard >= n.jours);
    if (!cible || cible.niveau <= f.niveau_envoye) continue;
    const email = f.client?.email;
    if (!email) {
      resultats.push({ facture: f.numero, niveau: cible.niveau, statut: "pas d'email client" });
      continue;
    }
    const { sujet, texte } = message(cible.niveau, f);

    if (!actif) {
      resultats.push({ facture: f.numero, niveau: cible.niveau, a: email, sujet, statut: "simulation" });
      continue;
    }

    // Réserve le niveau avant l'envoi : la contrainte unique empêche tout doublon
    const reserve = await sql`
      insert into public.relances (user_id, facture_id, niveau, resultat)
      values (${f.user_id}, ${f.id}, ${cible.niveau}, 'en cours')
      on conflict (facture_id, niveau) do nothing
      returning id`;
    if (reserve.length === 0) continue;

    const rep = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: expediteur,
        to: [email],
        reply_to: f.vendeur?.email || undefined,
        subject: sujet,
        text: texte,
      }),
    });
    const corps = await rep.json().catch(() => ({}));
    if (rep.ok) {
      await sql`update public.relances set resultat = ${"envoyée " + (corps.id ?? "")} where id = ${reserve[0].id}`;
      resultats.push({ facture: f.numero, niveau: cible.niveau, a: email, statut: "envoyée" });
    } else {
      // Échec : on libère le niveau pour réessayer demain
      await sql`delete from public.relances where id = ${reserve[0].id}`;
      resultats.push({ facture: f.numero, niveau: cible.niveau, statut: "erreur", detail: corps });
    }
  }

  return json({ mode: actif ? "réel" : "simulation", factures_echues: factures.length, relances: resultats });
});
