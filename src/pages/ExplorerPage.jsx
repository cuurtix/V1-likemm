/* =============================================================================
   LIKEMM — Explorer / recherche (§15 / §24)
   =============================================================================
   La recherche est executee par la base, paginee et indexee. Le navigateur ne
   charge jamais la liste complete des utilisateurs (§43).

   La section « Profils les plus likés » remplace les anciennes « Tendances » :
   ce sont exactement les premieres lignes du vrai classement, pas une
   selection editorialisee ni un echantillon aleatoire.
   ========================================================================== */

import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search as SearchIcon, Users } from "lucide-react";
import { PageShell, PageHero, SearchBar, UserCard } from "../components/molecules.jsx";
import { SkeletonRow, EmptyState, ErrorState } from "../components/atoms.jsx";
import { SecondaryButton } from "../components/forms.jsx";
import { searchService } from "../services/searchService.js";
import { leaderboardService } from "../services/leaderboardService.js";
import { analyticsService, EVENTS } from "../services/analyticsService.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useLikeAction } from "../hooks/useLikeAction.js";
import { mapError } from "../lib/errors.js";
import { setPageMeta } from "../lib/seo.js";

export default function ExplorerPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const [top, setTop] = useState([]);
  const [loadingTop, setLoadingTop] = useState(true);
  const [topError, setTopError] = useState(null);

  const searchId = useRef(0);

  useEffect(() => {
    setPageMeta({
      title: "Explorer",
      description: "Recherchez un profil Likemm par son nom d'utilisateur.",
      path: "/explorer",
    });
  }, []);

  const patch = useCallback((userId, values) => {
    const apply = (list) => list.map((r) => (r.user_id === userId ? { ...r, ...values } : r));
    setResults(apply);
    setTop(apply);
  }, []);

  const { toggleLike, busyId } = useLikeAction({
    onResult: patch,
    source: "search",
    onRequireAuth: () => navigate("/signup"),
  });

  // Profils les plus likes = debut du vrai classement general.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await leaderboardService.getLeaderboard("general", 8, 0);
        if (!active) return;
        setTop(data);
      } catch (e) {
        if (active) setTopError(mapError(e));
      } finally {
        if (active) setLoadingTop(false);
      }
    })();
    return () => { active = false; };
  }, []);

  // Recherche : declenchee apres une courte pause de frappe, resultats reels.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return undefined;
    }

    setSearching(true);
    const id = ++searchId.current;
    const timer = setTimeout(async () => {
      try {
        const data = await searchService.searchProfiles(trimmed, 20, 0);
        if (id !== searchId.current) return;
        setResults(data);
        setSearchError(null);
        analyticsService.trackEvent(EVENTS.SEARCH_PERFORMED, {
          query_length: trimmed.length,
          result_count: data.length,
        });
      } catch (e) {
        if (id !== searchId.current) return;
        setSearchError(mapError(e));
        setResults([]);
      } finally {
        if (id === searchId.current) setSearching(false);
      }
    }, 260);

    return () => clearTimeout(timer);
  }, [query]);

  const showingSearch = query.trim().length > 0;

  return (
    <PageShell
      hero={
        <PageHero
          title="Explorer"
          subtitle="Cherchez un profil par son nom d'utilisateur."
        />
      }
    >
      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder="Rechercher un utilisateur…"
        loading={searching}
      />

      <div className="mt-8 space-y-2">
        {showingSearch ? (
          searchError ? (
            <ErrorState message={searchError} onRetry={() => setQuery((q) => `${q} `.trim())} />
          ) : searching ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
          ) : results.length === 0 ? (
            <EmptyState
              icon={SearchIcon}
              title="Aucun utilisateur trouvé"
              subtitle={`Aucun profil public ne correspond à « ${query.trim()} ».`}
            />
          ) : (
            <>
              <p className="text-[13px] mb-3" style={{ color: "var(--text-muted)" }}>
                {results.length} résultat{results.length > 1 ? "s" : ""}
              </p>
              {results.map((row, i) => (
                <UserCard
                  key={row.user_id}
                  row={row}
                  index={i}
                  busy={busyId === row.user_id}
                  canLike={isAuthenticated}
                  onLike={toggleLike}
                />
              ))}
            </>
          )
        ) : (
          <>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-[20px] font-semibold" style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>
                Profils les plus likés
              </h2>
              <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>Classement général</span>
            </div>

            {topError ? (
              <ErrorState message={topError} />
            ) : loadingTop ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
            ) : top.length === 0 ? (
              <EmptyState
                icon={Users}
                title="Aucun utilisateur pour le moment"
                subtitle="Les profils apparaîtront ici dès les premières inscriptions."
                action={
                  !isAuthenticated && (
                    <SecondaryButton full={false} onClick={() => navigate("/signup")}>
                      Créer mon profil
                    </SecondaryButton>
                  )
                }
              />
            ) : (
              top.map((row, i) => (
                <UserCard
                  key={row.user_id}
                  row={{ ...row, rank: row.rank }}
                  index={i}
                  busy={busyId === row.user_id}
                  canLike={isAuthenticated}
                  onLike={toggleLike}
                />
              ))
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}
