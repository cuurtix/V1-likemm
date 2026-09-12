-- =============================================================================
-- LIKEMM — 11 · Taches planifiees (pg_cron)
-- =============================================================================
-- Ce fichier est SANS EFFET si l'extension pg_cron n'est pas activee sur le
-- projet. Il ne provoque pas d'erreur : tout est conditionne a sa presence.
--
-- Pour l'activer : tableau de bord Supabase > Database > Extensions > pg_cron.
-- Les taches ci-dessous ne sont pas indispensables au fonctionnement de la V1 —
-- le classement se calcule en direct a faible volumetrie — mais elles le
-- deviennent en montant en charge, et `snapshot_ranks` est ce qui alimente
-- l'historique de classement et les notifications de progression.
-- =============================================================================

do $$
declare
  v_has_cron boolean;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_has_cron;

  if not v_has_cron then
    raise notice 'pg_cron absent : aucune tache planifiee. Voir supabase/README.md.';
    return;
  end if;

  -- Les appels passent par cron.schedule, qui remplace une tache de meme nom.

  -- 1. Cache de classement — toutes les 5 minutes.
  perform cron.schedule(
    'likemm_refresh_leaderboards', '*/5 * * * *',
    $job$ select public.refresh_leaderboards(); $job$
  );

  -- 2. Instantane des rangs + notifications de progression — une fois par jour,
  --    a 03:10 UTC. Une fois par jour est volontaire : une notification a
  --    chaque micro-mouvement serait une mecanique d'engagement inutilement
  --    insistante (§46 : pas de notifications manipulatrices).
  perform cron.schedule(
    'likemm_snapshot_ranks', '10 3 * * *',
    $job$ select public.snapshot_ranks(); $job$
  );

  -- 3. Detection de fraude — toutes les heures.
  perform cron.schedule(
    'likemm_fraud_detection', '25 * * * *',
    $job$ select public.run_fraud_detection(); $job$
  );

  -- 4. Levee automatique des suspensions arrivees a echeance — tous les
  --    quarts d'heure. Une suspension de 7 jours doit reellement s'arreter au
  --    bout de 7 jours.
  perform cron.schedule(
    'likemm_expire_sanctions', '*/15 * * * *',
    $job$ select public.expire_sanctions(); $job$
  );

  -- 5. Purge des compteurs de limitation — une fois par jour.
  perform cron.schedule(
    'likemm_purge_rate_limits', '40 4 * * *',
    $job$ delete from public.rate_limit_hits where occurred_at < now() - interval '7 days'; $job$
  );

  -- 6. Conservation des evenements analytiques.
  --    ATTENTION : 14 mois est une valeur de DEPART, pas une duree juridique
  --    affirmee. Elle doit etre fixee par le responsable du traitement puis
  --    reportee a l'identique dans la politique de confidentialite.
  perform cron.schedule(
    'likemm_purge_analytics', '50 4 * * *',
    $job$ select public.purge_analytics_events(14); $job$
  );

  raise notice 'Taches planifiees Likemm installees.';
end $$;
