/* =============================================================================
   LIKEMM — Onboarding (§23 / §43 / §49)
   =============================================================================
   « L'onboarding doit reellement aider l'utilisateur a comprendre :
     Cree ton profil -> partage-le -> recois des likes -> monte au classement. »

   Trois etapes courtes, pas de faux engagement, pas de compteur qui grimpe tout
   seul. La derniere etape propose le partage, parce que c'est reellement la
   seule facon de recevoir ses premiers likes.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Heart, Trophy, Share2, ArrowRight, Check, Lock } from "lucide-react";
import { Wordmark, UserAvatar, Spinner, Callout, ErrorState } from "../components/atoms.jsx";
import { PrimaryButton, SecondaryButton, TextArea, FormError } from "../components/forms.jsx";
import { ShareSheet } from "../components/dialogs.jsx";
import { profileService } from "../services/profileService.js";
import { storageService } from "../services/storageService.js";
import { shareService } from "../services/shareService.js";
import { analyticsService, EVENTS } from "../services/analyticsService.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { BIO_MAX } from "../lib/validation.js";
import { mapError } from "../lib/errors.js";
import { setPageMeta } from "../lib/seo.js";

const STEPS = 3;

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { profile, profileError, user, patchProfile, refreshProfile, isMinor } = useAuth();
  const { showToast } = useToast();

  const [step, setStep] = useState(1);
  const [bio, setBio] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [finishing, setFinishing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { setPageMeta({ title: "Bienvenue", path: "/onboarding", noindex: true }); }, []);
  useEffect(() => { if (profile?.bio) setBio(profile.bio); }, [profile?.bio]);

  const handlePhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user?.id) return;

    const problem = storageService.validateFile(file, "avatar");
    if (problem) { setError(problem); return; }

    setError(null);
    setUploading(true);
    try {
      const { url, path } = await storageService.uploadImage(file, "avatar", user.id);
      await profileService.updateProfile({ avatar_url: url });
      patchProfile({ avatar_url: url });
      storageService.removeOldImages("avatar", user.id, path).catch(() => {});
    } catch (e) {
      setError(mapError(e, "L'envoi de la photo a échoué."));
    } finally {
      setUploading(false);
    }
  };

  const saveBioAndContinue = async () => {
    setError(null);
    try {
      if (bio.trim() !== (profile?.bio || "")) {
        await profileService.updateProfile({ bio: bio.trim() || null });
        patchProfile({ bio: bio.trim() || null });
      }
      setStep(3);
    } catch (e) {
      setError(mapError(e));
    }
  };

  const finish = async () => {
    setFinishing(true);
    try {
      await profileService.updateProfile({ profile_completed: true });
      patchProfile({ profile_completed: true });
      analyticsService.trackEvent(EVENTS.PROFILE_COMPLETED);
      await refreshProfile();
      navigate("/", { replace: true });
    } catch (e) {
      showToast(mapError(e), "error");
    } finally {
      setFinishing(false);
    }
  };

  if (profileError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <ErrorState message={mapError(profileError)} onRetry={refreshProfile} />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size={22} />
      </div>
    );
  }

  const profileLink = shareService.profileUrl(profile.username, { ref: profile.username });

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-10">
      <div className="w-full max-w-[420px]">
        <div className="flex flex-col items-center mb-8">
          <Wordmark size="md" />
        </div>

        <div className="flex items-center gap-1.5 mb-8" aria-label={`Étape ${step} sur ${STEPS}`}>
          {Array.from({ length: STEPS }).map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full"
              style={{
                background: i < step ? "var(--accent)" : "var(--bg-elev-3)",
                transition: "background 0.28s",
              }}
            />
          ))}
        </div>

        {step === 1 && (
          <section>
            <h1 className="text-[26px] font-semibold leading-tight" style={{ color: "var(--text)", letterSpacing: "-0.025em" }}>
              Bienvenue, @{profile.username}
            </h1>
            <p className="text-[15px] mt-3 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Ajoutez une photo de profil. Ce n'est pas obligatoire, mais un profil avec une photo
              reçoit plus facilement des likes.
            </p>

            <div className="flex flex-col items-center mt-8">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="relative rounded-full flex items-center justify-center overflow-hidden group disabled:opacity-70"
                style={{
                  width: 132, height: 132,
                  background: "var(--bg-elev-1)",
                  boxShadow: "0 0 0 1px var(--hairline), 0 20px 40px rgba(0,0,0,0.10)",
                }}
                aria-label="Choisir une photo de profil"
              >
                <UserAvatar user={profile} size={132} />
                <span
                  className="absolute inset-x-0 bottom-0 py-2 text-[11px] font-semibold text-center"
                  style={{ background: "rgba(0,0,0,0.72)", color: "#fff", backdropFilter: "blur(8px)" }}
                >
                  {uploading ? (
                    <Spinner size={11} color="#fff" />
                  ) : (
                    <>
                      <Camera size={11} strokeWidth={2.4} className="inline mr-1" />
                      {profile.avatar_url ? "Modifier" : "Ajouter"}
                    </>
                  )}
                </span>
              </button>
              <input
                ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
                className="hidden" onChange={handlePhoto}
              />
              <p className="text-[13px] mt-5 text-center" style={{ color: "var(--text-muted)" }}>
                JPEG, PNG ou WebP · 3 Mo maximum
              </p>
            </div>

            {error && <div className="mt-4"><FormError>{error}</FormError></div>}

            <div className="mt-8 space-y-2">
              <PrimaryButton onClick={() => setStep(2)}>
                Continuer
                <ArrowRight size={15} strokeWidth={2.4} />
              </PrimaryButton>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-full py-3 text-[13px] font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                Plus tard
              </button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section>
            <h1 className="text-[26px] font-semibold leading-tight" style={{ color: "var(--text)", letterSpacing: "-0.025em" }}>
              Comment ça marche
            </h1>
            <p className="text-[15px] mt-3 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Likemm repose sur une règle simple.
            </p>

            <ol className="mt-7 space-y-4">
              {[
                { icon: Share2, title: "Partagez votre profil", text: "Votre lien : likemm.site/@" + profile.username },
                { icon: Heart, title: "Recevez des likes", text: "Une personne ne peut vous liker qu'une seule fois. Aucun like ne s'achète." },
                { icon: Trophy, title: "Montez au classement", text: "Votre position dépend uniquement du nombre de likes réellement reçus." },
              ].map((item, i) => (
                <li key={i} className="flex gap-3.5">
                  <span
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: "var(--bg-elev-2)", color: "var(--text-secondary)" }}
                  >
                    <item.icon size={18} strokeWidth={2} />
                  </span>
                  <div>
                    <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>{item.title}</p>
                    <p className="text-[14px] mt-0.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                      {item.text}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            {isMinor && (
              <Callout tone="info" title="Ton compte est protégé">
                Ton profil est <strong>privé</strong> : il n'apparaît pas au classement public et
                seules les personnes à qui tu envoies ton lien peuvent le voir. Tu peux le rendre
                public dans tes paramètres, en connaissance de cause.
              </Callout>
            )}

            <div className="mt-8">
              <TextArea
                label="Une phrase pour vous présenter (facultatif)"
                value={bio}
                onChange={setBio}
                maxLength={BIO_MAX}
                rows={3}
                placeholder="Ex. Photographe, voyages, café."
              />
            </div>

            {error && <div className="mt-4"><FormError>{error}</FormError></div>}

            <div className="mt-6">
              <PrimaryButton onClick={saveBioAndContinue}>
                Continuer
                <ArrowRight size={15} strokeWidth={2.4} />
              </PrimaryButton>
            </div>
          </section>
        )}

        {step === 3 && (
          <section>
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mb-5"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              <Check size={24} strokeWidth={2.4} />
            </div>
            <h1 className="text-[26px] font-semibold leading-tight" style={{ color: "var(--text)", letterSpacing: "-0.025em" }}>
              Votre profil est prêt
            </h1>
            <p className="text-[15px] mt-3 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Vous avez actuellement <strong>0 like</strong> et vous n'êtes pas encore classé.
              C'est normal : le classement se construit à partir de vrais likes.
            </p>

            {isMinor && (
              <Callout tone="neutral" title="Profil privé">
                <span className="inline-flex items-center gap-1.5">
                  <Lock size={12} />
                  Seules les personnes à qui tu envoies ton lien pourront voir ton profil.
                </span>
              </Callout>
            )}

            <div
              className="mt-6 rounded-[16px] px-4 py-3 text-[13px] break-all"
              style={{ background: "var(--bg-elev-2)", color: "var(--text-secondary)" }}
            >
              {profileLink}
            </div>

            <div className="mt-6 space-y-2">
              <PrimaryButton onClick={() => setShareOpen(true)}>
                <Share2 size={15} strokeWidth={2.2} />
                Partager mon profil
              </PrimaryButton>
              <SecondaryButton onClick={finish} disabled={finishing}>
                {finishing ? "…" : "Voir le classement"}
              </SecondaryButton>
            </div>
          </section>
        )}
      </div>

      <ShareSheet
        open={shareOpen}
        onClose={() => { setShareOpen(false); finish(); }}
        username={profile.username}
        url={profileLink}
        message={`Mon profil Likemm : @${profile.username}`}
        context="onboarding"
      />
    </div>
  );
}
