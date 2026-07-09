import { Component, ElementRef, OnDestroy, OnInit, inject, input, output, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ApiService } from '../../core/api.service';
import { TrainingResult, TrainingSession } from '../../core/models';

type RecordingMode = 'idle' | 'audio' | 'video';

/**
 * In-app training studio: record (or upload) audio → ElevenLabs voice clone;
 * record (or upload) video → stored footage + talking-photo avatar.
 * Everything is attached to the given profile — no external dashboards needed.
 */
@Component({
  selector: 'acf-training-studio',
  imports: [DatePipe],
  template: `
    <div class="grid gap-4 lg:grid-cols-3">
      <!-- IMAGE -->
      <div class="rounded-lg border border-sky-900/60 bg-slate-950/40 p-4">
        <h3 class="font-semibold text-white">📷 My image <span class="badge ml-1 bg-sky-950 text-sky-400">simplest</span></h3>
        <p class="mt-1 text-xs text-slate-400">
          Upload one clear photo of your face. It becomes your avatar at <b>full quality</b> —
          your profile voice speaks on this image. No video needed.
        </p>

        <div class="mt-3">
          <label class="btn-primary cursor-pointer">
            Choose photo
            <input type="file" accept="image/png,image/jpeg" class="hidden" (change)="onImageFile($event)" />
          </label>
        </div>

        @if (imageUrl(); as url) {
          <img [src]="url" alt="Avatar photo preview" class="mt-3 w-full rounded-lg border border-slate-800" />
          <button type="button" class="btn-primary mt-3" (click)="submitPhoto()" [disabled]="busy()">
            {{ busy() ? 'Setting avatar…' : '✓ Use this photo as my avatar' }}
          </button>
        }
      </div>

      <!-- VOICE -->
      <div class="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
        <h3 class="font-semibold text-white">🎙 Train my voice</h3>
        <p class="mt-1 text-xs text-slate-400">
          Record at least <b>60 seconds</b> of natural speech in a quiet room (2–3 minutes is better).
          The clone is built from <b>this recording only</b> — past recordings are never mixed in.
        </p>

        <div class="mt-3 flex flex-wrap items-center gap-2">
          @if (mode() !== 'audio') {
            <button type="button" class="btn-primary" (click)="startAudio()" [disabled]="mode() !== 'idle' || busy()">
              ● Record audio
            </button>
          } @else {
            <button type="button" class="btn-primary !bg-red-500 hover:!bg-red-400" (click)="stop()">
              ■ Stop ({{ elapsed() }}s)
            </button>
          }
          <label class="btn-ghost cursor-pointer">
            Upload file
            <input type="file" accept="audio/*" class="hidden" (change)="onAudioFile($event)" />
          </label>
        </div>

        @if (audioUrl(); as url) {
          <audio [src]="url" controls class="mt-3 w-full"></audio>
          <button type="button" class="btn-primary mt-3" (click)="submitVoice()" [disabled]="busy()">
            {{ busy() ? 'Cloning voice…' : '✓ Clone my voice from this recording' }}
          </button>
        }
      </div>

      <!-- VIDEO (optional) -->
      <div class="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
        <h3 class="font-semibold text-white">🎥 Train with video <span class="badge ml-1 bg-slate-800 text-slate-400">optional — trains better</span></h3>
        <p class="mt-1 text-xs text-slate-400">
          Record or upload <b>2+ minutes</b> facing the camera, good light, plain background.
          Footage is stored for full digital-twin training (Enterprise); a frame can update your avatar now.
        </p>

        <div class="mt-3 flex flex-wrap items-center gap-2">
          @if (mode() !== 'video') {
            <button type="button" class="btn-primary" (click)="startVideo()" [disabled]="mode() !== 'idle' || busy()">
              ● Record video
            </button>
          } @else {
            <button type="button" class="btn-primary !bg-red-500 hover:!bg-red-400" (click)="stop()">
              ■ Stop ({{ elapsed() }}s)
            </button>
          }
          <label class="btn-ghost cursor-pointer">
            Upload file
            <input type="file" accept="video/*" class="hidden" (change)="onVideoFile($event)" />
          </label>
        </div>

        <video #preview class="mt-3 w-full rounded-lg border border-slate-800" [class.hidden]="mode() !== 'video' && !videoUrl()" [src]="videoUrl() ?? undefined" [controls]="!!videoUrl()" [muted]="mode() === 'video'" autoplay playsinline></video>
        @if (videoUrl()) {
          <button type="button" class="btn-primary mt-3" (click)="submitAvatar()" [disabled]="busy()">
            {{ busy() ? 'Training avatar…' : '✓ Train avatar from this video' }}
          </button>
        }
      </div>
    </div>

    @if (message()) {
      <p class="mt-4 rounded-lg border px-3 py-2 text-sm" [class]="failed() ? 'border-red-900 bg-red-950/50 text-red-400' : 'border-emerald-900 bg-emerald-950/40 text-emerald-300'">
        {{ message() }}
      </p>
    }

    <!-- Compounding training history -->
    <div class="mt-5">
      <h4 class="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Training log — record of past sessions (not reused in training)
      </h4>
      @if (history().length === 0) {
        <p class="text-xs text-slate-500">No training sessions yet.</p>
      } @else {
        <div class="space-y-1">
          @for (session of history(); track session.id) {
            <div class="flex items-center gap-3 rounded-lg border border-slate-800/60 bg-slate-950/30 px-3 py-1.5 text-xs">
              <span class="badge" [class]="session.kind === 'voice' ? 'bg-sky-950 text-sky-400' : 'bg-amber-950 text-amber-400'">
                {{ session.kind === 'voice' ? '🎙 voice' : session.kind === 'avatar_photo' ? '📷 photo' : '🎥 video' }}
              </span>
              <span class="text-slate-400">{{ session.created_at | date: 'MMM d, HH:mm' }}</span>
              <span class="truncate text-slate-500">{{ session.notes || session.file_path.split('/').pop() }}</span>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class TrainingStudio implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);

  readonly profileId = input.required<string>();
  readonly trained = output<TrainingResult>();
  readonly history = signal<TrainingSession[]>([]);

  async ngOnInit(): Promise<void> {
    await this.refreshHistory();
  }

  private async refreshHistory(): Promise<void> {
    try {
      this.history.set(await this.api.trainingHistory(this.profileId()));
    } catch {
      /* history is non-critical */
    }
  }

  readonly preview = viewChild<ElementRef<HTMLVideoElement>>('preview');

  readonly mode = signal<RecordingMode>('idle');
  readonly elapsed = signal(0);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly failed = signal(false);
  readonly audioUrl = signal<string | null>(null);
  readonly videoUrl = signal<string | null>(null);
  readonly imageUrl = signal<string | null>(null);

  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private audioBlob: Blob | null = null;
  private videoBlob: Blob | null = null;
  private imageBlob: File | null = null;

  async startAudio(): Promise<void> {
    await this.startRecording({ audio: true }, 'audio');
  }

  async startVideo(): Promise<void> {
    await this.startRecording({ audio: true, video: { width: 1280, height: 720 } }, 'video');
    const el = this.preview()?.nativeElement;
    if (el && this.stream) {
      this.videoUrl.set(null);
      el.srcObject = this.stream;
    }
  }

  private async startRecording(constraints: MediaStreamConstraints, mode: RecordingMode): Promise<void> {
    this.message.set('');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch {
      this.failed.set(true);
      this.message.set('Microphone/camera permission denied — allow access in your browser and retry.');
      return;
    }
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.recorder.onstop = () => this.finishRecording(mode);
    this.recorder.start(1000);
    this.mode.set(mode);
    this.elapsed.set(0);
    this.timer = setInterval(() => this.elapsed.update((s) => s + 1), 1000);
  }

  stop(): void {
    this.recorder?.stop();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private finishRecording(mode: RecordingMode): void {
    const blob = new Blob(this.chunks, { type: this.recorder?.mimeType || 'video/webm' });
    this.stream?.getTracks().forEach((track) => track.stop());
    const el = this.preview()?.nativeElement;
    if (el) el.srcObject = null;
    if (mode === 'audio') {
      this.audioBlob = blob;
      this.audioUrl.set(URL.createObjectURL(blob));
    } else {
      this.videoBlob = blob;
      this.videoUrl.set(URL.createObjectURL(blob));
    }
    this.mode.set('idle');
  }

  onAudioFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.audioBlob = file;
    this.audioUrl.set(URL.createObjectURL(file));
  }

  onVideoFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.videoBlob = file;
    this.videoUrl.set(URL.createObjectURL(file));
  }

  onImageFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.imageBlob = file;
    this.imageUrl.set(URL.createObjectURL(file));
  }

  async submitPhoto(): Promise<void> {
    if (!this.imageBlob) return;
    await this.submit(() =>
      this.api.trainPhoto(this.profileId(), this.imageBlob!, this.imageBlob!.name || 'avatar.png'),
    );
  }

  async submitVoice(): Promise<void> {
    if (!this.audioBlob) return;
    await this.submit(() =>
      this.api.trainVoice(this.profileId(), [
        { blob: this.audioBlob!, filename: this.blobName(this.audioBlob!, 'voice') },
      ]),
    );
  }

  async submitAvatar(): Promise<void> {
    if (!this.videoBlob) return;
    await this.submit(() =>
      this.api.trainAvatar(this.profileId(), this.videoBlob!, this.blobName(this.videoBlob!, 'footage')),
    );
  }

  private async submit(call: () => Promise<TrainingResult>): Promise<void> {
    this.busy.set(true);
    this.failed.set(false);
    this.message.set('');
    try {
      const result = await call();
      this.message.set(result.message);
      this.trained.emit(result);
      await this.refreshHistory();
    } catch (err: unknown) {
      this.failed.set(true);
      const detail = (err as { error?: { error?: { message?: string } } })?.error?.error?.message;
      this.message.set(detail ?? 'Training failed — check the backend log.');
    } finally {
      this.busy.set(false);
    }
  }

  private blobName(blob: Blob, prefix: string): string {
    if (blob instanceof File && blob.name) return blob.name;
    const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm';
    return `${prefix}_recording.${ext}`;
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.stream?.getTracks().forEach((track) => track.stop());
  }
}
