/* =============================================================================
   LIKEMM — Mon profil (§6 / §8 / §10 / §14 / §21 / §49)
   =============================================================================
   Toutes les valeurs proviennent de la base. Le bouton « Partager mon profil »
   est mis en avant : le partage est une fonctionnalite centrale du produit,
   pas une option secondaire (§15 des ameliorations).
   ========================================================================== */

import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Camera, Share2, Settings as SettingsIcon, Heart, TrendingUp, Trophy, Lock, Link2,
} from "lucide-react";
import { PageShell, StatBlock } from "../components/molecules.jsx";
import { UserAvatar, EmptyState, ErrorState, Spinner, Callout } from "../components/atoms.jsx";
import { PrimaryButton, SecondaryButton, TextArea, ModalShell } from "../components/forms.jsx";
import { ShareSheet } from "../components/dialogs.jsx";
import { profileService } from "../services/profileService.js";
import { likeService } from "../services/likeService.js";
import { leaderboardService } from "../services/leaderboardService.js";
import { storageService } from "../services/storageService.js";
import { shareService } from "../services/shareService.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { formatCount, formatRelative } from "../lib/format.js";
import { BIO_MAX, bioError } from "../lib/validation.js";
import { mapError } from "../lib/errors.js";
import { setPageMeta } from "../lib/seo.js";

export default function ProfilePage() {
  const navigate = useNavigate();
  const { profile, refreshProfile, patchProfile, user } = useAuth();
  const { showToast } = useToast();

  const [rank, setRank] = useState(null);
  const [likers, setLikers] = useState([]);
  const [loadingSide, setLoadingSide] = useState(true);
  const [sideError, setSideError] = useState(null);
  const [uploading, setUploading] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [bioOpen, setBioOpen] = useState(false);

  const avatarInput = useRef(null);
  const coverInput = useRef(null);

  useEffect(() => {
    setPageMeta({ title: "Mon profil", path: "/profile", noindex: true });
  }, []);

  const loadSide = useCallback(async () => {
    setLoadingSide(true);
    setSideError(null);
    try {
      const [rankData, likersData] = await Promise.all([
        leaderboardService.getMyRank("general"),
        likeService.getMyLikers(12, 0),
      ]);
      setRank(rankData);
      setLikers(likersData);
    } catch (e) {
      setSideError(mapError(e));
    } finally {
      setLoadingSide(false);
    }
  }, []);

  useEffect(() => { loadSide(); }, [loadSide]);

  const handleFile = async (event, kind) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user?.id) return;

    const problem = storageService.validateFile(file, kind);
    if (problem) {
      showToast(problem, "error");
      return;
    }

    setUploading(kind);
    try {
      const { url, path } = await storageService.uploadImage(file, kind, user.id);
      const field = kind === "avatar" ? "avatar_url" : "cover_url";
      await profileService.updateProfile({ [field]: url });
      patchProfile({ [field]: url });
      // Nettoyage des anciennes images, sans bloquer l'utilisateur.
      storageService.removeOldImages(kind, user.id, path).catch(() => {});
      showToast(kind === "avatar" ? "Photo de profil mise à jour" : "Couverture mise à jour");
    } catch (e) {
      // §26 : pas de faux succes. L'image reste celle d'avant.
      showToast(mapError(e, "L'envoi de l'image a échoué."), "error");
    } finally {
      setUploading(null);
    }
  };

  if (!profile) {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center py-32">
          <Spinner size={22} />
        </div>
      </PageShell>
    );
  }

  const profileLink = shareService.profileUrl(profile.username, { ref: profile.username });

  return (
    <div className="pb-32 sm:pb-20">
      {/* Couverture */}
      <div className="relative h-48 sm:h-64 w-full sm:pt-14" style={{ background: "var(--bg-elev-2)" }}>
        {profile.cover_url && (
          <img src={profile.cover_url} className="w-full h-full object-cover" alt="" aria-hidden="true" />
        )}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to top, var(--bg) 0%, transparent 60%)" }}
        />
        <button
          type="button"
          onClick={() => coverInput.current?.click()}
          disabled={uploading === "cover"}
          aria-label="Modifier l'image de couverture"
          className="absolute top-20 sm:top-24 right-5 w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-60"
          style={{
            background: "var(--glass-bg)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            color: "var(--text)",
            boxShadow: "var(--shadow-sm), inset 0 0 0 1px var(--glass-border)",
          }}
        >
          {uploading === "cover" ? <Spinner size={15} /> : <Camera size={16} strokeWidth={2.2} />}
        </button>
        <input
          ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp"
          className="hidden" onChange={(e) => handleFile(e, "cover")}
        />
      </div>

      <div className="max-w-3xl sm:max-w-4xl mx-auto px-5 sm:px-8 -mt-16 relative">
        <div className="relative w-fit">
          <div className="rounded-full" style={{ boxShadow: "0 0 0 5px var(--bg), 0 12px 32px rgba(0,0,0,0.14)" }}>
            <UserAvatar user={profile} size={112} />
          </div>
          <button
            type="button"
            onClick={() => avatarInput.current?.click()}
            disabled={uploading === "avatar"}
            aria-label="Modifier ma photo de profil"
            className="absolute bottom-1 right-1 w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-60"
            style={{
              background: "var(--text)",
              color: "var(--bg)",
              boxShadow: "0 0 0 3px var(--bg), 0 4px 10px rgba(0,0,0,0.20)",
            }}
          >
            {uploading === "avatar" ? <Spinner size={14} color="var(--bg)" /> : <Camera size={15} strokeWidth={2.2} />}
          </button>
          <input
            ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp"
            className="hidden" onChange={(e) => handleFile(e, "avatar")}
          />
        </div>

        <div className="mt-5 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-[28px] font-semibold" style={{ color: "var(--text)", letterSpacing: "-0.025em" }}>
              @{profile.username}
            </h1>
            <button
              type="button"
              onClick={() => setBioOpen(true)}
              className="mt-2 text-left text-[15px] max-w-lg"
              style={{ color: profile.bio ? "var(--text-secondary)" : "var(--text-dim)" }}
            >
              {profile.bio || "Ajouter une bio"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="h-10 px-4 rounded-full text-[14px] font-semibold inline-flex items-center gap-2 shrink-0"
            style={{ background: "var(--bg-elev-1)", color: "var(--text)", boxShadow: "inset 0 0 0 1px var(--border)" }}
          >
            <SettingsIcon size={15} strokeWidth={2.2} />
            Paramètres
          </button>
        </div>

        {profile.is_private && (
          <Callout tone="neutral" title="Profil privé">
            Votre profil n'est visible que par vous et par les personnes disposant d'un lien
            d'invitation. Il n'apparaît ni au classement public, ni dans la recherche.{" "}
            <Link to="/settings" style={{ color: "var(--accent)" }}>Modifier</Link>
          </Callout>
        )}

        <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-6 max-w-lg">
          <StatBlock
            label="Rang"
            value={rank?.rank != null ? `#${rank.rank}` : "—"}
            sublabel={rank?.rank == null ? "Non classé" : null}
          />
          <StatBlock label="Likes" value={formatCount(profile.likes_total)} />
          <StatBlock
            label="Meilleur rang"
            value={profile.best_rank != null ? `#${profile.best_rank}` : "—"}
            sublabel={profile.best_rank == null ? "Pas encore mesuré" : null}
          />
        </div>

        {/* §49 des ameliorations : le partage est mis en avant, honnetement. */}
        <section
          className="mt-7 rounded-[20px] p-5 max-w-lg"
          style={{
            background: "linear-gradient(135deg, var(--accent-soft) 0%, transparent 70%), var(--bg-elev-1)",
            boxShadow: "inset 0 0 0 1px var(--accent-ring)",
          }}
        >
          <p className="text-[16px] font-semibold" style={{ color: "var(--text)" }}>
            {profile.likes_total > 0 ? "Continuez à partager votre profil" : "Votre profil Likemm est prêt"}
          </p>
          <p className="text-[14px] mt-1.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {profile.likes_total > 0
              ? "Chaque partage est une occasion de recevoir de nouveaux likes."
              : "Partagez-le pour recevoir vos premiers likes et entrer au classement."}
          </p>
          <div
            className="mt-4 flex items-center gap-2 rounded-[14px] px-3 h-11"
            style={{ background: "var(--bg-elev-1)", boxShadow: "inset 0 0 0 1px var(--border)" }}
          >
            <Link2 size={14} style={{ color: "var(--text-muted)" }} className="shrink-0" />
            <input
              readOnly
              value={profileLink}
              onFocus={(e) => e.target.select()}
              className="flex-1 min-w-0 bg-transparent outline-none text-[13px]"
              style={{ color: "var(--text-secondary)" }}
              aria-label="Lien de mon profil"
            />
          </div>
          <div className="mt-3">
            <PrimaryButton onClick={() => setShareOpen(true)}>
              <Share2 size={15} strokeWidth={2.2} />
              Partager mon profil
            </PrimaryButton>
          </div>
        </section>

        {/* §10 : qui m'a like, en respectant « masquer mes likes » (§21). */}
        <section className="mt-10 max-w-lg">
          <h2 className="text-[20px] font-semibold mb-4" style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>
            Mes likes reçus
          </h2>

          {sideError ? (
            <ErrorState message={sideError} onRetry={loadSide} />
          ) : loadingSide ? (
            <div className="flex justify-center py-10"><Spinner size={20} /></div>
          ) : likers.length === 0 ? (
            <EmptyState
              icon={Heart}
              title="Vous n'avez pas encore reçu de likes"
              subtitle="Partagez votre profil pour recevoir les premiers."
              action={
                <SecondaryButton full={false} onClick={() => setShareOpen(true)}>
                  Partager mon profil
                </SecondaryButton>
              }
            />
          ) : (
            <div
              className="rounded-[18px] overflow-hidden"
              style={{ background: "var(--bg-elev-1)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
            >
              {likers.map((l, i) => (
                <div
                  key={`${l.liked_at}-${i}`}
                  className="flex items-center gap-3 px-4 py-3"
                  style={{ borderBottom: i === likers.length - 1 ? "none" : "1px solid var(--hairline)" }}
                >
                  {l.hidden ? (
                    <span
                      className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: "var(--bg-elev-2)", color: "var(--text-muted)" }}
                    >
                      <Lock size={14} strokeWidth={2} />
                    </span>
                  ) : (
                    <UserAvatar
                      user={{ username: l.username, avatar_url: l.avatar_url }}
                      size={36}
                      onClick={() => navigate(`/@${l.username}`)}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium truncate" style={{ color: l.hidden ? "var(--text-muted)" : "var(--text)" }}>
                      {/* §21 : on ne devine pas un nom, on dit qu'il est masque. */}
                      {l.hidden ? "Utilisateur ayant masqué ses likes" : `@${l.username}`}
                    </p>
                    <p className="text-[12px] mt-0.5" style={{ color: "var(--text-dim)" }}>
                      {formatRelative(l.liked_at)}
                    </p>
                  </div>
                  <Heart size={14} strokeWidth={2.2} fill="currentColor" style={{ color: "var(--text-dim)" }} />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* §14 des ameliorations : historique reel, uniquement s'il existe. */}
        <RankHistorySection />
      </div>

      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        username={profile.username}
        url={profileLink}
        message={shareService.rankMessage({
          username: profile.username,
          rank: rank?.rank ?? null,
          likes: profile.likes_total,
        })}
        context="profile"
      />

      {bioOpen && (
        <EditBioModal
          initial={profile.bio || ""}
          onClose={() => setBioOpen(false)}
          onSaved={(bio) => {
            patchProfile({ bio });
            refreshProfile();
          }}
        />
      )}
    </div>
  );
}

function RankHistorySection() {
  const [history, setHistory] = useState(null);

  useEffect(() => {
    let active = true;
    leaderboardService
      .getMyRankHistory("general", 30)
      .then((data) => { if (active) setHistory(data); })
      .catch(() => { if (active) setHistory([]); });
    return () => { active = false; };
  }, []);

  if (!history || history.length < 2) return null;

  const latest = history[history.length - 1];
  const previous = history[history.length - 2];
  const delta = previous.rank - latest.rank;

  return (
    <section className="mt-10 max-w-lg">
      <h2 className="text-[20px] font-semibold mb-4" style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>
        Ma progression
      </h2>
      <div
        className="rounded-[18px] p-5"
        style={{ background: "var(--bg-elev-1)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
      >
        <div className="flex items-center gap-3">
          {delta !== 0 && (
            <span
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{
                background: delta > 0 ? "rgba(48,209,88,0.12)" : "var(--bg-elev-2)",
                color: delta > 0 ? "var(--success)" : "var(--text-muted)",
              }}
            >
              {delta > 0 ? <TrendingUp size={16} strokeWidth={2.4} /> : <Trophy size={16} strokeWidth={2.2} />}
            </span>
          )}
          <p className="text-[15px]" style={{ color: "var(--text)" }}>
            {delta > 0
              ? `+${delta} place${delta > 1 ? "s" : ""} depuis la dernière mesure`
              : delta < 0
                ? `${delta} place${delta < -1 ? "s" : ""} depuis la dernière mesure`
                : "Position stable depuis la dernière mesure"}
          </p>
        </div>
        <div className="mt-4 space-y-1.5">
          {history.slice(-6).reverse().map((h, i) => (
            <div key={i} className="flex items-center justify-between text-[13px]">
              <span style={{ color: "var(--text-muted)" }}>{formatRelative(h.recorded_at)}</span>
              <span className="tabular-nums font-medium" style={{ color: "var(--text)" }}>
                #{h.rank} · {formatCount(h.likes_count)} likes
              </span>
            </div>
          ))}
        </div>
        <p className="text-[12px] mt-4" style={{ color: "var(--text-dim)" }}>
          Les positions sont enregistrées une fois par jour. Rien n'est reconstitué a posteriori.
        </p>
      </div>
    </section>
  );
}

function EditBioModal({ initial, onClose, onSaved }) {
  const { showToast } = useToast();
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    const problem = bioError(value);
    if (problem) { setError(problem); return; }
    setSaving(true);
    try {
      await profileService.updateProfile({ bio: value.trim() || null });
      onSaved(value.trim() || null);
      showToast("Bio mise à jour");
      onClose();
    } catch (e) {
      setError(mapError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Bio" onClose={onClose}>
      <div className="space-y-4">
        <TextArea
          value={value}
          onChange={setValue}
          maxLength={BIO_MAX}
          rows={4}
          placeholder="Parlez de vous en quelques mots…"
          hint="Visible sur votre profil public."
          error={error}
        />
        <PrimaryButton onClick={save} loading={saving}>Enregistrer</PrimaryButton>
      </div>
    </ModalShell>
  );
}
