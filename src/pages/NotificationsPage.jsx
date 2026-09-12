/* =============================================================================
   LIKEMM — Notifications (§19 / §24)
   =============================================================================
   Chaque ligne correspond a un evenement reel enregistre en base. Aucune
   notification n'est generee pour donner l'impression que le site est actif.
   ========================================================================== */

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { PageShell, PageHero, SegmentedControl, NotificationItem } from "../components/molecules.jsx";
import { SkeletonRow, EmptyState, ErrorState } from "../components/atoms.jsx";
import { SecondaryButton } from "../components/forms.jsx";
import { notificationService } from "../services/notificationService.js";
import { analyticsService, EVENTS } from "../services/analyticsService.js";
import { useAuth } from "../context/AuthContext.jsx";
import { mapError } from "../lib/errors.js";
import { setPageMeta } from "../lib/seo.js";

const PAGE_SIZE = 30;

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();

  const [items, setItems] = useState([]);
  const [tab, setTab] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    setPageMeta({ title: "Notifications", path: "/notifications", noindex: true });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await notificationService.getNotifications({ limit: PAGE_SIZE, offset: 0 });
      setItems(data);
      setHasMore(data.length === PAGE_SIZE);
    } catch (e) {
      setError(mapError(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Temps reel si disponible ; sinon la page reste correcte au rechargement.
  useEffect(() => {
    if (!user?.id) return undefined;
    return notificationService.subscribe(user.id, () => load());
  }, [user?.id, load]);

  const markAllRead = async () => {
    try {
      await notificationService.markAsRead(null);
      setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
      refreshProfile();
    } catch (e) {
      setError(mapError(e));
    }
  };

  const openProfile = (username) => {
    analyticsService.trackEvent(EVENTS.NOTIFICATION_OPENED);
    navigate(`/@${username}`);
  };

  const loadMore = async () => {
    try {
      const data = await notificationService.getNotifications({ limit: PAGE_SIZE, offset: items.length });
      setItems((prev) => [...prev, ...data]);
      setHasMore(data.length === PAGE_SIZE);
    } catch (e) {
      setError(mapError(e));
    }
  };

  const unreadCount = items.filter((n) => !n.read_at).length;
  const filtered = tab === "unread" ? items.filter((n) => !n.read_at) : items;

  return (
    <PageShell
      hero={<PageHero title="Notifications" subtitle="Vos likes, votre progression, vos paliers." />}
    >
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[["all", "Tout"], ["unread", `Non lus${unreadCount ? ` · ${unreadCount}` : ""}`]]}
        />
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="text-[13px] font-medium"
            style={{ color: "var(--accent)" }}
          >
            Tout marquer comme lu
          </button>
        )}
      </div>

      <div className="space-y-2">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : loading ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={tab === "unread" ? "Aucune notification non lue" : "Pas encore de notifications"}
            subtitle={
              tab === "unread"
                ? "Vous êtes à jour."
                : "Vous serez prévenu quand quelqu'un vous like ou quand votre classement change."
            }
          />
        ) : (
          <>
            {filtered.map((n) => (
              <NotificationItem key={n.id} n={n} onOpenProfile={openProfile} />
            ))}
            {hasMore && tab === "all" && (
              <div className="pt-4">
                <SecondaryButton onClick={loadMore}>Afficher plus</SecondaryButton>
              </div>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}
