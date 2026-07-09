"""Creator profile endpoints — configurable voice + avatar identities.

Any person can be onboarded by creating a profile with their trained
voice_id / avatar_id; projects pick a profile; nothing is hardcoded.
Training happens in-app: recorded audio → ElevenLabs voice clone;
recorded video → stored footage + talking-photo avatar from a frame.
"""
import uuid
from pathlib import Path

from fastapi import APIRouter, UploadFile, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.core.config import get_settings
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationFailedError
from app.db.models import CreatorProfile, TrainingSession
from app.domain.enums import AvatarProvider, TrainingKind, VoiceProvider
from app.providers.avatar.heygen import HeyGenAvatarProvider
from app.providers.media.ffmpeg import FFmpegComposer
from app.providers.tts.elevenlabs import ElevenLabsVoiceLab
from app.repositories.profiles import CreatorProfileRepository
from app.schemas.profiles import (
    AvatarCatalogItem,
    ProfileCreate,
    ProfileOut,
    ProfileUpdate,
    TrainingResult,
    TrainingSessionOut,
    VoiceCatalogItem,
)

router = APIRouter(prefix="/profiles", tags=["profiles"])

_MIN_VOICE_SAMPLE_BYTES = 100_000  # ~a few seconds of audio; guards empty uploads


async def _get_owned(session, user, profile_id: str) -> CreatorProfile:
    profile = await CreatorProfileRepository(session).get(profile_id)
    if profile is None:
        raise NotFoundError("Profile not found")
    if profile.owner_id != user.id:
        raise ForbiddenError("Not your profile")
    return profile


@router.get("", response_model=list[ProfileOut])
async def list_profiles(session: DbSession, user: CurrentUser) -> list[ProfileOut]:
    profiles = await CreatorProfileRepository(session).list_for_owner(user.id)
    return [ProfileOut.model_validate(p) for p in profiles]


@router.post("", response_model=ProfileOut, status_code=status.HTTP_201_CREATED)
async def create_profile(body: ProfileCreate, session: DbSession, user: CurrentUser) -> ProfileOut:
    repo = CreatorProfileRepository(session)
    if body.is_default:
        await repo.clear_default(user.id)
    profile = await repo.add(CreatorProfile(owner_id=user.id, **body.model_dump(mode="json")))
    return ProfileOut.model_validate(profile)


@router.put("/{profile_id}", response_model=ProfileOut)
async def update_profile(
    profile_id: str, body: ProfileUpdate, session: DbSession, user: CurrentUser
) -> ProfileOut:
    profile = await _get_owned(session, user, profile_id)
    repo = CreatorProfileRepository(session)
    if body.is_default and not profile.is_default:
        await repo.clear_default(user.id)
    for key, value in body.model_dump(mode="json").items():
        setattr(profile, key, value)
    return ProfileOut.model_validate(profile)


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_profile(profile_id: str, session: DbSession, user: CurrentUser) -> None:
    profile = await _get_owned(session, user, profile_id)
    await session.delete(profile)


_MAX_CLONE_SAMPLES = 25  # ElevenLabs instant-clone file limit


@router.post("/{profile_id}/voice-training", response_model=TrainingResult)
async def train_voice(
    profile_id: str, files: list[UploadFile], session: DbSession, user: CurrentUser
) -> TrainingResult:
    """Clone the person's voice from EXACTLY the audio provided in this request.

    No history is mixed in (past samples would dilute the clone) — one
    training session, one clean clone. The previous app-made clone is
    deleted to free the voice slot; the ledger keeps a log for display only.
    """
    settings = get_settings()
    if not settings.elevenlabs_api_key:
        raise ValidationFailedError("ELEVENLABS_API_KEY is not configured")
    if not files:
        raise ValidationFailedError("Upload or record at least one audio sample")

    profile = await _get_owned(session, user, profile_id)
    training_dir = settings.media_dir / "training" / profile.id
    training_dir.mkdir(parents=True, exist_ok=True)

    composer = FFmpegComposer()
    new_paths: list[str] = []
    total_new_bytes = 0
    for upload in files:
        raw_path = training_dir / f"voice_raw_{uuid.uuid4().hex[:8]}_{upload.filename or 'sample'}"
        raw_path.write_bytes(await upload.read())
        mp3_path = raw_path.with_suffix(".mp3")
        await composer.transcode_to_mp3(raw_path, mp3_path)
        total_new_bytes += mp3_path.stat().st_size
        new_paths.append(str(mp3_path))
    if total_new_bytes < _MIN_VOICE_SAMPLE_BYTES:
        raise ValidationFailedError("Audio too short — record at least ~30 seconds of speech")

    # THIS request's audio only — never past samples (they dilute the clone).
    seen_sizes: set[int] = set()
    samples: list[tuple[str, bytes, str]] = []
    for path_str in new_paths[:_MAX_CLONE_SAMPLES]:
        path = Path(path_str)
        size = path.stat().st_size
        if size in seen_sizes:
            continue  # same file uploaded twice
        seen_sizes.add(size)
        samples.append((path.name, path.read_bytes(), "audio/mpeg"))

    voice_lab = ElevenLabsVoiceLab(settings.elevenlabs_api_key)
    voice_id = await voice_lab.clone_voice(profile.name, samples)

    # Free the old slot if the previous voice was an app-made clone for this profile.
    previous_sessions = await session.execute(
        select(TrainingSession).where(
            TrainingSession.profile_id == profile.id, TrainingSession.provider_id == profile.voice_id
        )
    )
    if profile.voice_id and previous_sessions.scalars().first() is not None:
        await voice_lab.delete_voice(profile.voice_id)

    for path in new_paths:
        session.add(
            TrainingSession(
                profile_id=profile.id,
                kind=TrainingKind.VOICE.value,
                file_path=path,
                provider_id=voice_id,
                notes=f"clone built from this session's {len(samples)} sample(s) only",
            )
        )

    profile.voice_provider = VoiceProvider.ELEVENLABS.value
    profile.voice_id = voice_id
    return TrainingResult(
        kind="voice",
        provider_id=voice_id,
        message=(
            f"Voice cloned from exactly what you just provided and attached to “{profile.name}”. "
            "Past recordings were not mixed in."
        ),
    )


@router.post("/{profile_id}/photo-training", response_model=TrainingResult)
async def train_photo(
    profile_id: str, image: UploadFile, session: DbSession, user: CurrentUser
) -> TrainingResult:
    """Set the profile's avatar from a single photo — full original quality, no video needed.

    The image is sent to HeyGen untouched (no re-encode), so avatar quality
    matches the source photo exactly. The profile's voice then speaks on it.
    """
    settings = get_settings()
    if not settings.heygen_api_key:
        raise ValidationFailedError("HEYGEN_API_KEY is not configured")
    if not (image.content_type or "").startswith("image/"):
        raise ValidationFailedError("Upload an image file (PNG or JPEG)")

    profile = await _get_owned(session, user, profile_id)
    training_dir = settings.media_dir / "training" / profile.id
    training_dir.mkdir(parents=True, exist_ok=True)

    suffix = ".png" if "png" in (image.content_type or "") else ".jpg"
    photo_path = training_dir / f"avatar_photo_{uuid.uuid4().hex[:8]}{suffix}"
    photo_path.write_bytes(await image.read())

    provider = HeyGenAvatarProvider(settings.heygen_api_key, FFmpegComposer(), talking_photo=True)
    photo_id = await provider.create_talking_photo(photo_path)

    profile.avatar_provider = AvatarProvider.HEYGEN_PHOTO.value
    profile.avatar_id = photo_id
    profile.photo_path = str(photo_path)
    session.add(
        TrainingSession(
            profile_id=profile.id,
            kind=TrainingKind.AVATAR_PHOTO.value,
            file_path=str(photo_path),
            provider_id=photo_id,
        )
    )
    return TrainingResult(
        kind="avatar",
        provider_id=photo_id,
        message=f"Avatar set from your photo at full quality. “{profile.name}” now speaks on this image.",
    )


@router.post("/{profile_id}/avatar-training", response_model=TrainingResult)
async def train_avatar(
    profile_id: str, video: UploadFile, session: DbSession, user: CurrentUser
) -> TrainingResult:
    """Store training footage and build a talking-photo avatar from it.

    The raw footage is kept under media/training/<profile> so a full HeyGen
    digital-twin (Enterprise API) can be trained from it later without
    re-recording; until then a frame becomes the talking-photo avatar.
    """
    settings = get_settings()
    if not settings.heygen_api_key:
        raise ValidationFailedError("HEYGEN_API_KEY is not configured")

    profile = await _get_owned(session, user, profile_id)
    training_dir = settings.media_dir / "training" / profile.id
    training_dir.mkdir(parents=True, exist_ok=True)

    footage_path = training_dir / f"avatar_footage_{uuid.uuid4().hex[:8]}_{video.filename or 'recording.webm'}"
    footage_path.write_bytes(await video.read())

    composer = FFmpegComposer()
    frame_path = training_dir / "avatar_frame.png"
    await composer.extract_frame(footage_path, frame_path, at_seconds=1.0)

    provider = HeyGenAvatarProvider(settings.heygen_api_key, composer, talking_photo=True)
    photo_id = await provider.create_talking_photo(frame_path)

    profile.avatar_provider = AvatarProvider.HEYGEN_PHOTO.value
    profile.avatar_id = photo_id
    profile.photo_path = str(frame_path)
    session.add(
        TrainingSession(
            profile_id=profile.id,
            kind=TrainingKind.AVATAR_VIDEO.value,
            file_path=str(footage_path),
            provider_id=photo_id,
            notes="footage stored for digital-twin training",
        )
    )
    return TrainingResult(
        kind="avatar",
        provider_id=photo_id,
        message=(
            "Footage stored and talking-photo avatar updated from your video. "
            "The raw footage is kept for full digital-twin training (HeyGen Enterprise)."
        ),
    )


@router.get("/{profile_id}/training", response_model=list[TrainingSessionOut])
async def training_history(profile_id: str, session: DbSession, user: CurrentUser) -> list[TrainingSessionOut]:
    """The compounding training ledger for this profile."""
    profile = await _get_owned(session, user, profile_id)
    result = await session.execute(
        select(TrainingSession)
        .where(TrainingSession.profile_id == profile.id)
        .order_by(TrainingSession.created_at.desc())
    )
    return [TrainingSessionOut.model_validate(row) for row in result.scalars().all()]


@router.get("/catalog/voices", response_model=list[VoiceCatalogItem])
async def voice_catalog(_: CurrentUser) -> list[VoiceCatalogItem]:
    """Available ElevenLabs voices (premade + your clones)."""
    settings = get_settings()
    if not settings.elevenlabs_api_key:
        raise ValidationFailedError("ELEVENLABS_API_KEY is not configured")
    voices = await ElevenLabsVoiceLab(settings.elevenlabs_api_key).list_voices()
    return [VoiceCatalogItem(**v) for v in voices]


@router.get("/catalog/avatars", response_model=list[AvatarCatalogItem])
async def avatar_catalog(_: CurrentUser, search: str = "", limit: int = 60) -> list[AvatarCatalogItem]:
    """Available HeyGen avatars (stock + any trained on the connected account)."""
    settings = get_settings()
    if not settings.heygen_api_key:
        raise ValidationFailedError("HEYGEN_API_KEY is not configured")
    provider = HeyGenAvatarProvider(settings.heygen_api_key, FFmpegComposer())
    avatars = await provider.list_avatars()
    needle = search.lower()
    matched = [a for a in avatars if needle in (a.get("name") or "").lower()] if needle else avatars
    return [AvatarCatalogItem(**a) for a in matched[:limit]]
