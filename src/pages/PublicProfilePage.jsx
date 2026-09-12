/* =============================================================================
   LIKEMM — Profil public /@username (§5, §7, §8, §32, §39, §40 et §5 des
   ameliorations)
   =============================================================================
   C'est la page qui transforme un visiteur en utilisateur. Elle doit donc etre
   irreprochable dans les deux sens :

     * un visiteur non connecte voit les informations publiques et un appel a
       l'action clair, mais ne peut PAS interagir (§8) — et ce n'est pas
       l'interface qui l'en empeche, c'est la base ;
     * un profil prive, supprime, suspendu ou masque a un comportement propre,
       explicite, sans page cassee ni 404 trompeuse (§40).
   ========================================================================== */

import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { Lock, UserX, Share2, Flag, Ban, ArrowLeft, ExternalLink, Heart } from "lucide-react";
import { PageShell, StatBlock } from "../components/molecules.jsx";
import { UserAvatar, LikeButton, EmptyState, ErrorState, Spinner } from "../components/atoms.jsx";
import { PrimaryButton, SecondaryButton } from "../components/forms.jsx";
import { ShareSheet, ReportDialog, ConfirmDialog } from "../components/dialogs.jsx";
import { profileService } from "../services/profileService.js";
import { likeService } from "../services/likeService.js";
import { blockService } from "../services/blockService.js";
import { shareService } from "../services/shareService.js";
import { analyticsService, EVENTS } from "../services/analyticsService.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { formatCount, formatDate } from "../lib/format.js";
import { mapError } from "../lib/errors.js";
import { setPageMeta } from "../lib/seo.js";
import { cameFromShare } from "../lib/acquisition.js";
import { APP_NAME } from "../lib/config.js";

export default function PublicProfilePage() {
  // La route est /:handle et le composant n'est monte que pour un segment
  // commencant par « @ » (voir App.jsx) : react-router v6 ne sait pas declarer
  // un parametre au milieu d'un segment, on retire donc l'arobase ici.
  const { handle } = useParams();
  const username = String(handle || "").replace(/^@/, "").toLowerCase();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, profile: me, isBlockedAccount } = useAuth();
  const { showToast } = useToast();

  // Token d'acces a un profil prive (§32) : ?k=<token>
  const inviteToken = searchParams.get("k");
  const fromShare = Boolean(searchParams.get("ref")) || cameFromShare();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [liking, setLiking] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await profileService.getPublicProfile(username, inviteToken);
      setData(result);
    } catch (e) {
      setError(mapError(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [username, inviteToken]);

  useEffect(() => { load(); }, [load]);

  // Metadonnees de page. Un profil prive est explicitement exclu des moteurs
  // de recherche (§39).
  useEffect(() => {
    if (!data) return;
    if (!data.found) {
      setPageMeta({ title: "Profil introuvable", path: `/@${username}`, noindex: true });
      return;
    }
    if (data.private && !data.id) {
      setPageMeta({ title: `@${data.username}`, path: `/@${username}`, noindex: true });
      return;
    }
    setPageMeta({
      title: `@${data.username}`,
      description: data.bio
        ? `${data.bio} — ${formatCount(data.likes_total)} likes sur ${APP_NAME}.`
        : `@${data.username} sur ${APP_NAME} : ${formatCount(data.likes_total)} likes${data.rank ? `, #${data.rank} au classement` : ""}.`,
      path: `/@${data.username}`,
      noindex: data.private === true || data.listed === false,
    });
  }, [data, username]);

  // Mesure : consultation de profil, et consultation via un lien partage.
  useEffect(() => {
    if (!data?.found || !data.id) return;
    analyticsService.trackEvent(EVENTS.PROFILE_VIEWED);
    if (fromShare) analyticsService.trackEvent(EVENTS.SHARED_PROFILE_VIEWED);
  }, [data?.id, data?.found, fromShare]);

  const handleLike = async () => {
    if (!isAuthenticated) {
      // §8 : invitation a creer un compte, pas un echec silencieux.
      navigate(`/signup?next=${encodeURIComponent(`/@${username}`)}`);
      return;
    }
    if (isBlockedAccount) {
      showToast("Votre compte ne peut pas effectuer cette action.", "error");
      return;
    }

    const wasLiked = data.liked_by_me;
    setLiking(true);
    try {
      const result = wasLiked
        ? await likeService.unlike(data.id)
        : await likeService.like(data.id, {
            inviteToken,
            source: fromShare ? "shared_profile" : "profile",
          });

      setData((d) => ({
        ...d,
        liked_by_me: result.liked,
        likes_total: result.target_likes_total,
        likes_24h: result.target_likes_24h,
      }));

      analyticsService.trackEvent(wasLiked ? EVENTS.LIKE_REMOVED : EVENTS.LIKE_GIVEN, {
        source: fromShare ? "shared_profile" : "profile",
      });
      if (!wasLiked && fromShare) analyticsService.trackEvent(EVENTS.LIKE_FROM_SHARED_PROFILE);
    } catch (e) {
      // Aucun changement affiche : l'operation a echoue (§26).
      showToast(mapError(e), "error");
    } finally {
      setLiking(false);
    }
  };

  const handleBlock = async () => {
    try {
      await blockService.block(data.username);
      showToast(`@${data.username} est bloqué.`);
      setBlockOpen(false);
      navigate("/");
    } catch (e) {
      showToast(mapError(e), "error");
    }
  };

  // --- Etats de chargement et d'erreur --------------------------------------
  if (loading) {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center py-32">
          <Spinner size={22} />
          <p className="text-[14px] mt-4" style={{ color: "var(--text-muted)" }}>Chargement du profil…</p>
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell>
        <ErrorState message={error} onRetry={load} />
      </PageShell>
    );
  }

  // §40 : profil inexistant, supprimé ou indisponible — comportement propre.
  if (!data?.found) {
    const reasons = {
      deleted: {
        title: "Ce compte a été supprimé",
        subtitle: "Le profil et ses données ne sont plus disponibles.",
      },
      unavailable: {
        title: "Ce profil n'est pas disponible",
        subtitle: "Il fait l'objet d'une mesure de modération ou a été désactivé.",
      },
      blocked: {
        title: "Profil inaccessible",
        subtitle: "Vous ne pouvez pas consulter ce profil.",
      },
      not_found: {
        title: "Ce profil n'existe pas",
        subtitle: `Aucun compte ne porte le nom @${username}.`,
      },
    };
    const r = reasons[data?.reason] || reasons.not_found;
    return (
      <PageShell>
        <EmptyState
          icon={UserX}
          title={r.title}
          subtitle={r.subtitle}
          action={
            <SecondaryButton full={false} onClick={() => navigate("/")}>
              Retour au classement
            </SecondaryButton>
          }
        />
      </PageShell>
    );
  }

  // §32 : profil privé sans token valide. Rien du contenu n'est envoyé au
  // navigateur — ce n'est pas un masquage CSS.
  if (data.private && !data.id) {
    return (
      <PageShell>
        <div className="max-w-md mx-auto text-center py-20">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: "var(--bg-elev-2)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
          >
            <Lock size={24} strokeWidth={1.6} style={{ color: "var(--text-muted)" }} />
          </div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text)" }}>
            @{data.username}
          </h1>
          <p className="text-[15px] mt-3 leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Ce profil est privé. Il n'est accessible qu'avec un lien d'invitation fourni par son
            propriétaire.
          </p>
          {inviteToken && (
            <p className="text-[13px] mt-3" style={{ color: "var(--danger)" }}>
              Le lien utilisé n'est plus valide ou a été révoqué.
            </p>
          )}
          <div className="mt-8">
            <SecondaryButton full={false} onClick={() => navigate("/")}>
              Retour au classement
            </SecondaryButton>
          </div>
        </div>
      </PageShell>
    );
  }

  const isMe = data.is_me;
  const links = Array.isArray(data.external_links) ? data.external_links : [];

  return (
    <div className="pb-32 sm:pb-20">
      {/* Couverture. Sans image, un aplat neutre : aucune photo n'est empruntee. */}
      <div className="relative h-44 sm:h-60 w-full sm:pt-14" style={{ background: "var(--bg-elev-2)" }}>
        {data.cover_url && (
          <img src={data.cover_url} className="w-full h-full object-cover" alt="" aria-hidden="true" />
        )}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to top, var(--bg) 0%, transparent 60%)" }}
        />
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="absolute top-20 sm:top-24 left-5 w-10 h-10 rounded-full flex items-center justify-center"
          style={{
            background: "var(--glass-bg)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            color: "var(--text)",
            boxShadow: "var(--shadow-sm), inset 0 0 0 1px var(--glass-border)",
          }}
          aria-label="Retour"
        >
          <ArrowLeft size={17} strokeWidth={2.2} />
        </button>
      </div>

      <div className="max-w-3xl sm:max-w-4xl mx-auto px-5 sm:px-8 -mt-14 relative">
        <div className="rounded-full w-fit" style={{ boxShadow: "0 0 0 5px var(--bg), 0 12px 32px rgba(0,0,0,0.14)" }}>
          <UserAvatar user={data} size={104} />
        </div>

        <div className="mt-5 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1
              className="text-[28px] font-semibold"
              style={{ color: "var(--text)", letterSpacing: "-0.025em" }}
            >
              @{data.username}
            </h1>
            <p className="text-[13px] mt-1" style={{ color: "var(--text-dim)" }}>
              Sur {APP_NAME} depuis {formatDate(data.created_at)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="h-10 px-4 rounded-full text-[14px] font-semibold inline-flex items-center gap-2"
              style={{ background: "var(--bg-elev-1)", color: "var(--text)", boxShadow: "inset 0 0 0 1px var(--border)" }}
            >
              <Share2 size={15} strokeWidth={2.2} />
              Partager
            </button>
            {isAuthenticated && !isMe && (
              <>
                <button
                  type="button"
                  onClick={() => setReportOpen(true)}
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: "var(--bg-elev-1)", color: "var(--text-muted)", boxShadow: "inset 0 0 0 1px var(--border)" }}
                  aria-label={`Signaler @${data.username}`}
                  title="Signaler ce profil"
                >
                  <Flag size={15} strokeWidth={2.2} />
                </button>
                <button
                  type="button"
                  onClick={() => setBlockOpen(true)}
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: "var(--bg-elev-1)", color: "var(--text-muted)", boxShadow: "inset 0 0 0 1px var(--border)" }}
                  aria-label={`Bloquer @${data.username}`}
                  title="Bloquer ce profil"
                >
                  <Ban size={15} strokeWidth={2.2} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* §24 : bio absente = phrase honnete, pas un texte de remplissage. */}
        <p className="text-[15px] mt-4 max-w-xl leading-relaxed" style={{ color: data.bio ? "var(--text-secondary)" : "var(--text-dim)" }}>
          {data.bio || "Cette personne n'a pas encore ajouté de bio."}
        </p>

        {links.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {links.map((link, i) => (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer nofollow ugc"
                className="h-9 px-3.5 rounded-full text-[13px] font-medium inline-flex items-center gap-1.5"
                style={{ background: "var(--bg-elev-1)", color: "var(--text-secondary)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
              >
                {link.label || new URL(link.url).hostname.replace("www.", "")}
                <ExternalLink size={11} style={{ color: "var(--text-dim)" }} />
              </a>
            ))}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-6 max-w-lg">
          <StatBlock
            label="Rang"
            value={data.rank != null ? `#${data.rank}` : "—"}
            sublabel={data.rank == null ? "Non classé" : null}
          />
          <StatBlock label="Likes" value={formatCount(data.likes_total)} />
          <StatBlock label="24 h" value={formatCount(data.likes_24h)} />
        </div>

        <div className="mt-7 max-w-lg">
          {isMe ? (
            <SecondaryButton onClick={() => navigate("/profile")}>Voir mon profil</SecondaryButton>
          ) : isAuthenticated ? (
            <LikeButton
              variant="pill"
              liked={data.liked_by_me}
              busy={liking}
              onToggle={handleLike}
              full
            />
          ) : (
            /* §8 + §5 des ameliorations : le visiteur externe est converti ici. */
            <div
              className="rounded-[20px] p-5"
              style={{
                background: "linear-gradient(135deg, var(--accent-soft) 0%, transparent 70%), var(--bg-elev-1)",
                boxShadow: "inset 0 0 0 1px var(--accent-ring)",
              }}
            >
              <p className="text-[16px] font-semibold" style={{ color: "var(--text)" }}>
                Likez ce profil
              </p>
              <p className="text-[14px] mt-1.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Créez votre compte pour liker @{data.username}, puis créez le vôtre et grimpez le
                classement.
              </p>
              <div className="mt-4 flex flex-col sm:flex-row gap-2">
                <PrimaryButton onClick={() => navigate(`/signup?next=${encodeURIComponent(`/@${username}`)}`)}>
                  <Heart size={15} strokeWidth={2.4} />
                  Créer mon profil
                </PrimaryButton>
                <SecondaryButton onClick={() => navigate(`/login?next=${encodeURIComponent(`/@${username}`)}`)}>
                  J'ai déjà un compte
                </SecondaryButton>
              </div>
            </div>
          )}
        </div>

        <p className="text-[12px] mt-8" style={{ color: "var(--text-dim)" }}>
          <Link to="/" style={{ color: "var(--accent)" }}>Voir le classement {APP_NAME}</Link>
        </p>
      </div>

      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        username={data.username}
        url={shareService.profileUrl(data.username, { ref: isMe ? data.username : me?.username || null })}
        message={
          isMe
            ? shareService.rankMessage({
                username: data.username,
                rank: data.rank,
                likes: data.likes_total,
              })
            : `Le profil ${APP_NAME} de @${data.username}`
        }
        context="profile"
      />

      <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} username={data.username} />

      <ConfirmDialog
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        onConfirm={handleBlock}
        title={`Bloquer @${data.username}`}
        message={`Vous ne pourrez plus interagir avec ce profil, et il ne pourra plus interagir avec le vôtre. Les likes échangés entre vous seront supprimés. Vous pourrez annuler ce blocage dans vos paramètres.`}
        confirmLabel="Bloquer"
        danger
      />
    </div>
  );
}
