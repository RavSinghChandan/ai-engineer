import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AvatarCatalogItem, CreatorProfile, CreatorProfileDraft, TrainingResult } from '../../core/models';
import { TrainingStudio } from './training-studio.component';

const EMPTY_DRAFT: CreatorProfileDraft = {
  name: '',
  voice_provider: 'macos_say',
  voice_id: null,
  avatar_provider: 'none',
  avatar_id: null,
  avatar_required: false,
  is_default: false,
};

@Component({
  selector: 'acf-profiles-page',
  imports: [FormsModule, TrainingStudio],
  template: `
    <div class="mx-auto max-w-6xl space-y-6">
      <header class="flex items-end justify-between">
        <div>
          <h1 class="text-2xl font-bold text-white">Creator Profiles</h1>
          <p class="text-sm text-slate-400">
            A profile is a person: their voice and their avatar. Projects pick a profile — train a new
            person by adding a profile, never by changing code.
          </p>
        </div>
        <button class="btn-primary" (click)="startCreate()">＋ New profile</button>
      </header>

      <!-- Existing profiles -->
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        @for (profile of profiles(); track profile.id) {
          <div class="card space-y-2">
            <div class="flex items-center justify-between">
              <h2 class="font-semibold text-white">{{ profile.name }}</h2>
              @if (profile.is_default) {
                <span class="badge bg-sky-950 text-sky-400">default</span>
              }
            </div>
            <p class="text-xs text-slate-400">
              Voice: <span class="text-slate-200">{{ profile.voice_provider }}</span>
              @if (profile.voice_id) { ({{ profile.voice_id }}) }
            </p>
            <p class="text-xs text-slate-400">
              Avatar:
              <span class="text-slate-200">
                {{ profile.avatar_provider === 'none' ? 'none (slideshow video)' : profile.avatar_id }}
              </span>
            </p>
            <div class="flex gap-2 pt-2">
              <button class="btn-ghost !px-3 !py-1 text-xs" (click)="startEdit(profile)">Edit</button>
              <button class="btn-ghost !px-3 !py-1 text-xs hover:!border-red-500 hover:!text-red-400" (click)="remove(profile)">
                Delete
              </button>
            </div>
          </div>
        } @empty {
          <div class="card text-slate-400 md:col-span-3">No profiles yet — create one to enable avatar videos.</div>
        }
      </div>

      <!-- Editor -->
      @if (editing()) {
        <form class="card space-y-5" (ngSubmit)="save()">
          <h2 class="font-semibold text-white">{{ editingId() ? 'Edit profile' : 'New profile' }}</h2>

          <div class="grid gap-4 md:grid-cols-3">
            <div>
              <label class="label" for="pname">Person / profile name</label>
              <input id="pname" class="input" [(ngModel)]="draft.name" name="name" placeholder="Rav Chandan Kumar Singh" required />
            </div>
            <div>
              <label class="label" for="vprov">Voice provider</label>
              <select id="vprov" class="input" [(ngModel)]="draft.voice_provider" name="voice_provider">
                <option value="macos_say">macOS say (free, offline)</option>
                <option value="elevenlabs">ElevenLabs (cloned voice)</option>
              </select>
            </div>
            <div>
              <label class="label" for="vid">Voice id</label>
              <input
                id="vid"
                class="input"
                [(ngModel)]="draft.voice_id"
                name="voice_id"
                [placeholder]="draft.voice_provider === 'elevenlabs' ? 'ElevenLabs voice_id (your clone)' : 'Samantha'"
              />
            </div>
          </div>

          <div class="grid gap-4 md:grid-cols-3">
            <div>
              <label class="label" for="aprov">Avatar provider</label>
              <select id="aprov" class="input" [(ngModel)]="draft.avatar_provider" name="avatar_provider" (ngModelChange)="onAvatarProviderChange()">
                <option value="none">None — slideshow video</option>
                <option value="heygen">HeyGen — studio avatar / digital twin</option>
                <option value="heygen_photo">HeyGen — talking photo (from one image)</option>
              </select>
            </div>
            <div>
              <label class="label" for="aid">Avatar id</label>
              <input id="aid" class="input" [(ngModel)]="draft.avatar_id" name="avatar_id" placeholder="pick from catalog below or paste your trained avatar_id" />
            </div>
            <div class="flex items-end gap-4 pb-1">
              <label class="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" [(ngModel)]="draft.avatar_required" name="avatar_required" class="accent-sky-500" />
                Fail job if avatar fails
              </label>
              <label class="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" [(ngModel)]="draft.is_default" name="is_default" class="accent-sky-500" />
                Default profile
              </label>
            </div>
          </div>

          @if (draft.avatar_provider === 'heygen') {
            <div class="space-y-3">
              <div class="flex items-center gap-3">
                <input class="input max-w-xs" [(ngModel)]="catalogSearch" name="catalogSearch" placeholder="Search HeyGen avatars…" />
                <button type="button" class="btn-ghost" (click)="loadCatalog()" [disabled]="catalogLoading()">
                  {{ catalogLoading() ? 'Loading…' : 'Browse catalog' }}
                </button>
                <span class="text-xs text-slate-500">Your trained avatar will appear here once HeyGen finishes training it.</span>
              </div>
              @if (catalog().length) {
                <div class="grid max-h-80 grid-cols-2 gap-3 overflow-y-auto md:grid-cols-4 lg:grid-cols-6">
                  @for (avatar of catalog(); track avatar.avatar_id) {
                    <button
                      type="button"
                      class="rounded-lg border p-2 text-left transition"
                      [class]="draft.avatar_id === avatar.avatar_id ? 'border-sky-500 bg-sky-950/40' : 'border-slate-800 hover:border-slate-600'"
                      (click)="draft.avatar_id = avatar.avatar_id"
                    >
                      @if (avatar.preview_image_url) {
                        <img [src]="avatar.preview_image_url" [alt]="avatar.name" class="mb-1 h-20 w-full rounded object-cover" loading="lazy" />
                      }
                      <p class="truncate text-xs text-slate-300">{{ avatar.name }}</p>
                    </button>
                  }
                </div>
              }
            </div>
          }

          @if (error()) {
            <p class="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-400">{{ error() }}</p>
          }

          <div class="flex gap-3">
            <button class="btn-primary" type="submit" [disabled]="busy() || !draft.name">
              {{ busy() ? 'Saving…' : 'Save profile' }}
            </button>
            <button class="btn-ghost" type="button" (click)="editing.set(false)">Cancel</button>
          </div>

          @if (editingId(); as id) {
            <div class="border-t border-slate-800 pt-5">
              <h3 class="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
                Training studio — train this profile on a real person
              </h3>
              <acf-training-studio [profileId]="id" (trained)="onTrained($event)" />
            </div>
          } @else {
            <p class="text-xs text-slate-500">Save the profile first, then reopen it to record voice/video training.</p>
          }
        </form>
      }
    </div>
  `,
})
export class ProfilesPage implements OnInit {
  private readonly api = inject(ApiService);

  readonly profiles = signal<CreatorProfile[]>([]);
  readonly editing = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly catalog = signal<AvatarCatalogItem[]>([]);
  readonly catalogLoading = signal(false);

  draft: CreatorProfileDraft = { ...EMPTY_DRAFT };
  catalogSearch = '';

  async ngOnInit(): Promise<void> {
    this.profiles.set(await this.api.listProfiles());
  }

  startCreate(): void {
    this.draft = { ...EMPTY_DRAFT };
    this.editingId.set(null);
    this.editing.set(true);
  }

  startEdit(profile: CreatorProfile): void {
    const { id, created_at, ...rest } = profile;
    this.draft = { ...rest };
    this.editingId.set(id);
    this.editing.set(true);
  }

  onAvatarProviderChange(): void {
    if (this.draft.avatar_provider === 'none') this.draft.avatar_id = null;
  }

  async loadCatalog(): Promise<void> {
    this.catalogLoading.set(true);
    this.error.set('');
    try {
      this.catalog.set(await this.api.avatarCatalog(this.catalogSearch));
    } catch {
      this.error.set('Could not load the HeyGen catalog — check HEYGEN_API_KEY.');
    } finally {
      this.catalogLoading.set(false);
    }
  }

  async save(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const id = this.editingId();
      if (id) {
        await this.api.updateProfile(id, this.draft);
      } else {
        await this.api.createProfile(this.draft);
      }
      this.profiles.set(await this.api.listProfiles());
      this.editing.set(false);
    } catch (err: unknown) {
      const detail = (err as { error?: { error?: { message?: string } } })?.error?.error?.message;
      this.error.set(detail ?? 'Saving failed.');
    } finally {
      this.busy.set(false);
    }
  }

  async onTrained(result: TrainingResult): Promise<void> {
    this.profiles.set(await this.api.listProfiles());
    const current = this.profiles().find((p) => p.id === this.editingId());
    if (current) this.startEdit(current);
  }

  async remove(profile: CreatorProfile): Promise<void> {
    if (!confirm(`Delete profile “${profile.name}”?`)) return;
    await this.api.deleteProfile(profile.id);
    this.profiles.set(await this.api.listProfiles());
  }
}
