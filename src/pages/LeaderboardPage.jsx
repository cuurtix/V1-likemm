/* =============================================================================
   LIKEMM — Classement (§11 / §12 / §13 / §24)
   =============================================================================
   Toutes les valeurs affichees viennent de la base. Si la base est vide, la
   page affiche un etat vide honnete : aucun profil fictif, aucun compteur
   inventee, aucun podium factice (§56).
   ========================================================================== */

import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Trophy, Share2, Users } from "lucide-react";
import { PageShell, PageHero, SegmentedControl, LeaderboardRow, TopThree } from "../components/molecules.jsx";
import { SkeletonRow, SkeletonTop3, EmptyState, ErrorState, UserAvatar } from "../components/atoms.jsx";
import { SecondaryButton } from "../components/forms.jsx";
import { ShareSheet } from "../components/dialogs.jsx";
import { leaderboardService } from "../services/leaderboardService.js";
import { analyticsService, EVENTS } from "../services/analyticsService.js";
import { shareService } from "../services/shareService.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useLikeAction } from "../hooks/useLikeAction.js";
import { formatCount } from "../lib/format.js";
import { mapError } from "../lib/errors.js";
import { setPageMeta } from "../lib/seo.js";

const PAGE_SIZE = 20;

/** Raisons pour lesquelles l'utilisateur n'a legitimement pas de rang. */
const NO_RANK_MESSAGE = {
  profile_private:
    "Votre profil est privé : il n'apparaît pas au classement public. Rendez-le public dans vos paramètres pour y figurer.",
  profile_hidden: "Votre profil est actuellement masqué par la modération.",
  setup_incomplete: "Terminez la création de votre compte pour apparaître au classement.",
  no_likes_24h: "Vous n'avez pas encore reçu de like au cours des dernières 24 heures.",
  not_ranked: "Vous n'apparaissez pas encore au classement.",
  account_suspended: "Votre compte est suspendu : il n'apparaît pas au classement.",
  account_banned: "Votre compte est banni : il n'apparaît pas au classement.",
};

export default function LeaderboardPage() {
  const navigate = useNavigate();
  const { isAuthenticated, profile } = useAuth();

  const [mode, setMode] = useState("general");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  const [rankContext, setRankContext] = useState(null);
  const [neighbors, setNeighbors] = useState([]);
  const [shareOpen, setShareOpen] = useState(false);

  const requestId = useRef(0);

  useEffect(() => {
    setPageMeta({
      title: "Classement",
      description:
        "Le classement Likemm, calculé sur les likes réellement reçus. Classement général et classement 24 heures.",
      path: "/",
    });
  }, []);

  const applyLikeResult = useCallback((userId, patch) => {
    setRows((prev) => prev.map((r) => (r.user_id === userId ? { ...r, ...patch } : r)));
  }, []);

  const { toggleLike, busyId } = useLikeAction({
    onResult: applyLikeResult,
    source: "leaderboard",
    onRequireAuth: () => navigate("/signup"),
  });

  const load = useCallback(
    async (nextMode) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);
      try {
        const data = await leaderboardService.getLeaderboard(nextMode, PAGE_SIZE, 0);
        if (id !== requestId.current) return;
        setRows(data);
        setHasMore(data.length === PAGE_SIZE);
      } catch (e) {
        if (id !== requestId.current) return;
        setError(mapError(e));
        setRows([]);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    load(mode);
    analyticsService.trackEvent(
      mode === "24h" ? EVENTS.LEADERBOARD_24H_VIEWED : EVENTS.LEADERBOARD_VIEWED,
      { mode },
    );
  }, [mode, load]);

  // Position personnelle : chargee separement, et seulement si l'on est
  // connecte. Elle est TOUJOURS calculee exactement cote base.
  useEffect(() => {
    let active = true;
    if (!isAuthenticated) {
      setRankContext(null);
      setNeighbors([]);
      return undefined;
    }
    (async () => {
      try {
        const [ctx, nb] = await Promise.all([
          leaderboardService.getRankContext(mode),
          leaderboardService.getNeighbors(mode, 1),
        ]);
        if (!active) return;
        setRankContext(ctx);
        setNeighbors(nb);
        if (ctx?.rank) analyticsService.trackEvent(EVENTS.OWN_RANK_VIEWED, { mode, rank: ctx.rank });
      } catch {
        if (active) {
          setRankContext(null);
          setNeighbors([]);
        }
      }
    })();
    return () => { active = false; };
  }, [mode, isAuthenticated, profile?.likes_total]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const data = await leaderboardService.getLeaderboard(mode, PAGE_SIZE, rows.length);
      setRows((prev) => [...prev, ...data]);
      setHasMore(data.length === PAGE_SIZE);
    } catch (e) {
      setError(mapError(e));
    } finally {
      setLoadingMore(false);
    }
  };

  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <PageShell
      hero={
        <PageHero
          title="Classement"
          subtitle="La popularité, mesurée en likes réellement reçus."
        />
      }
    >
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[["general", "Général"], ["24h", "24 heures"]]}
        />
        <span className="text-[12px]" style={{ color: "var(--text-dim)" }}>
          {mode === "24h" ? "Likes reçus sur les dernières 24 h" : "Depuis la création du compte"}
        </span>
      </div>

      {isAuthenticated && <MyPositionCard context={rankContext} neighbors={neighbors} mode={mode} onShare={() => setShareOpen(true)} />}

      {error ? (
        <ErrorState message={error} onRetry={() => load(mode)} />
      ) : (
        <>
          {/* Podium : uniquement a partir de 3 profils reellement classes. */}
          {(loading || rows.length >= 3) && (
            <section className="mb-8">
              <div className="flex items-baseline justify-between mb-1">
                <h2 className="text-[20px] font-semibold" style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>
                  Podium
                </h2>
                <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>Top 3</span>
              </div>
              <div
                className="rounded-[24px] mt-3 relative overflow-hidden"
                style={{ background: "var(--bg-elev-1)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
              >
                {loading ? <SkeletonTop3 /> : <TopThree rows={top3} />}
              </div>
            </section>
          )}

          <section>
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-[20px] font-semibold" style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>
                {rows.length >= 3 ? "Classement" : "Profils classés"}
              </h2>
              {!loading && rows.length > 0 && (
                <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                  {rows.length} profil{rows.length > 1 ? "s" : ""} affiché{rows.length > 1 ? "s" : ""}
                </span>
              )}
            </div>

            <div className="space-y-2">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
              ) : rows.length === 0 ? (
                <EmptyState
                  icon={mode === "24h" ? Trophy : Users}
                  title={
                    mode === "24h"
                      ? "Aucun like sur les dernières 24 heures"
                      : "Aucun profil au classement pour le moment"
                  }
                  subtitle={
                    mode === "24h"
                      ? "Le classement 24 heures se remplit dès qu'un like est donné."
                      : "Le classement se construit à partir des likes réellement reçus. Partagez votre profil pour lancer le vôtre."
                  }
                  action={
                    isAuthenticated ? (
                      <SecondaryButton full={false} onClick={() => setShareOpen(true)}>
                        Partager mon profil
                      </SecondaryButton>
                    ) : (
                      <SecondaryButton full={false} onClick={() => navigate("/signup")}>
                        Créer mon profil
                      </SecondaryButton>
                    )
                  }
                />
              ) : (
                <>
                  {(rows.length >= 3 ? rest : rows).map((row, i) => (
                    <LeaderboardRow
                      key={row.user_id}
                      row={row}
                      index={i}
                      busy={busyId === row.user_id}
                      canLike={isAuthenticated}
                      onLike={toggleLike}
                    />
                  ))}
                  {hasMore && (
                    <div className="pt-4">
                      <SecondaryButton onClick={loadMore} disabled={loadingMore}>
                        {loadingMore ? "Chargement…" : "Afficher plus"}
                      </SecondaryButton>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        </>
      )}

      {profile && (
        <ShareSheet
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          username={profile.username}
          url={shareService.profileUrl(profile.username, { ref: profile.username })}
          message={shareService.rankMessage({
            username: profile.username,
            rank: rankContext?.rank ?? null,
            likes: rankContext?.likes_count ?? null,
            mode,
          })}
          context="leaderboard"
        />
      )}
    </PageShell>
  );
}

/**
 * Carte « votre position ».
 * Si le rang n'existe pas, on explique POURQUOI au lieu d'afficher un chiffre.
 */
function MyPositionCard({ context, neighbors, mode, onShare }) {
  const navigate = useNavigate();
  if (!context) return null;

  if (context.rank == null) {
    const message = NO_RANK_MESSAGE[context.reason] || null;
    if (!message) return null;
    return (
      <section
        className="rounded-[24px] p-5 mb-8"
        style={{ background: "var(--bg-elev-1)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
      >
        <p className="text-[12px] font-semibold uppercase tracking-[0.10em]" style={{ color: "var(--text-muted)" }}>
          Votre position
        </p>
        <p className="text-[15px] mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {message}
        </p>
        {context.reason === "profile_private" && (
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="mt-3 text-[14px] font-semibold"
            style={{ color: "var(--accent)" }}
          >
            Ouvrir les paramètres
          </button>
        )}
      </section>
    );
  }

  const above = context.above;

  return (
    <section
      className="rounded-[24px] p-6 mb-8 relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, var(--accent-soft) 0%, transparent 65%), var(--bg-elev-1)",
        boxShadow: "inset 0 0 0 1px var(--accent-ring), var(--shadow-md)",
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-[0.10em]" style={{ color: "var(--accent)" }}>
            Votre position
          </p>
          <div className="flex items-baseline gap-3 mt-2">
            <p
              className="text-[56px] font-semibold tabular-nums leading-none"
              style={{ color: "var(--text)", letterSpacing: "-0.035em" }}
            >
              #{context.rank}
            </p>
          </div>
          <p className="text-[14px] mt-2" style={{ color: "var(--text-muted)" }}>
            <span className="tabular-nums font-semibold" style={{ color: "var(--text)" }}>
              {formatCount(context.likes_count)}
            </span>{" "}
            like{context.likes_count > 1 ? "s" : ""} {mode === "24h" ? "sur 24 h" : "au total"}
            {context.total_ranked ? ` · sur ${formatCount(context.total_ranked)} profils classés` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onShare}
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={{ background: "var(--bg-elev-2)", color: "var(--text-secondary)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
          aria-label="Partager mon classement"
        >
          <Share2 size={16} strokeWidth={2.2} />
        </button>
      </div>

      {/* §10 des ameliorations : « Il te manque N likes pour depasser #X. »
          Affiche uniquement si la donnee existe reellement. */}
      {above && context.likes_to_pass != null && (
        <div
          className="mt-5 pt-4 flex items-center gap-3"
          style={{ borderTop: "1px solid var(--hairline)" }}
        >
          <UserAvatar user={{ username: above.username, avatar_url: above.avatar_url }} size={32} />
          <p className="text-[14px] leading-snug" style={{ color: "var(--text-secondary)" }}>
            Il vous manque{" "}
            <span className="font-semibold tabular-nums" style={{ color: "var(--text)" }}>
              {context.likes_to_pass} like{context.likes_to_pass > 1 ? "s" : ""}
            </span>{" "}
            pour dépasser{" "}
            <span className="font-semibold" style={{ color: "var(--text)" }}>
              @{above.username}
            </span>
            {above.rank != null && ` (#${above.rank})`}.
          </p>
        </div>
      )}

      {context.rank === 1 && (
        <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--hairline)" }}>
          <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
            Vous êtes en tête du classement.
          </p>
        </div>
      )}

      {neighbors.length > 1 && (
        <div className="mt-5 pt-5 space-y-0.5" style={{ borderTop: "1px solid var(--hairline)" }}>
          {neighbors.map((u) => (
            <div
              key={u.user_id}
              role={!u.is_me ? "button" : undefined}
              tabIndex={!u.is_me ? 0 : undefined}
              onClick={() => {
                if (u.is_me) return;
                analyticsService.trackEvent(EVENTS.NEIGHBOR_PROFILE_VIEWED, { mode });
                navigate(`/@${u.username}`);
              }}
              className={`flex items-center gap-3 px-2 py-2 rounded-xl ${!u.is_me ? "cursor-pointer" : ""}`}
              style={{ background: u.is_me ? "var(--accent-soft)" : "transparent" }}
            >
              <span
                className="text-[13px] font-semibold tabular-nums w-9 shrink-0"
                style={{ color: u.is_me ? "var(--accent)" : "var(--text-muted)" }}
              >
                #{u.rank}
              </span>
              <UserAvatar user={u} size={30} />
              <span className="text-[14px] flex-1 truncate" style={{ color: "var(--text)" }}>
                @{u.username}
                {u.is_me && <span className="ml-1 text-[12px]" style={{ color: "var(--accent)" }}>· vous</span>}
              </span>
              <span className="text-[12px] tabular-nums shrink-0" style={{ color: "var(--text-muted)" }}>
                {formatCount(u.likes_count)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
