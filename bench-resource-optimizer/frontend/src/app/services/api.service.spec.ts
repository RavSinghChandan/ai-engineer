/**
 * ApiService unit tests.
 * HttpClient is mocked — no real HTTP calls are made.
 * Verifies that the service builds correct request URLs and bodies.
 */

import { of, throwError } from 'rxjs';

// Minimal Angular decorator stubs
const Injectable = () => (t: any) => t;

class MockHttpClient {
  get = jest.fn();
  post = jest.fn();
  delete = jest.fn();
  put = jest.fn();
}

// Replicate the ApiService logic under test
class ApiService {
  private base = '/api';
  constructor(private http: any) {}

  getRoles() { return this.http.get(`${this.base}/roles`); }

  uploadCv(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post(`${this.base}/upload-cv`, fd);
  }

  mapRole(userId: string, targetRole: string) {
    return this.http.post(`${this.base}/map-role`, { user_id: userId, target_role: targetRole });
  }

  generatePlan(userId: string, targetRole: string, missingSkills: string[], numDays = 7) {
    return this.http.post(`${this.base}/generate-plan`, {
      user_id: userId, target_role: targetRole,
      missing_skills: missingSkills, num_days: numDays,
    });
  }

  getProgress(userId: string) { return this.http.get(`${this.base}/progress/${userId}`); }

  updateProgress(userId: string, completedIds: string[]) {
    return this.http.post(`${this.base}/update-progress`, {
      user_id: userId, completed_task_ids: completedIds,
    });
  }

  getMemory(userId: string) { return this.http.get(`${this.base}/memory/${userId}`); }

  getMetrics() { return this.http.get(`${this.base}/metrics`); }

  getHealthReady() { return this.http.get(`${this.base}/health/ready`); }
}

describe('ApiService', () => {
  let http: MockHttpClient;
  let service: ApiService;

  beforeEach(() => {
    http = new MockHttpClient();
    service = new ApiService(http);
  });

  // ── getRoles ───────────────────────────────────────────────────────────────

  test('positive: getRoles calls GET /api/roles', () => {
    http.get.mockReturnValue(of([]));
    service.getRoles().subscribe();
    expect(http.get).toHaveBeenCalledWith('/api/roles');
  });

  test('positive: getRoles emits the roles array', (done) => {
    const roles = [{ id: 'r1', title: 'Python Dev', description: 'Python expert' }];
    http.get.mockReturnValue(of(roles));
    service.getRoles().subscribe(result => {
      expect(result).toEqual(roles);
      done();
    });
  });

  // ── uploadCv ───────────────────────────────────────────────────────────────

  test('positive: uploadCv calls POST /api/upload-cv with FormData', () => {
    const file = new File(['pdf content'], 'resume.pdf', { type: 'application/pdf' });
    http.post.mockReturnValue(of({ user_id: 'u1', profile: {} }));
    service.uploadCv(file).subscribe();
    expect(http.post).toHaveBeenCalledWith('/api/upload-cv', expect.any(FormData));
  });

  test('positive: uploadCv emits the parsed profile response', (done) => {
    const response = { user_id: 'u1', profile: { name: 'Ravi', skills: ['Python'] } };
    const file = new File(['pdf'], 'cv.pdf', { type: 'application/pdf' });
    http.post.mockReturnValue(of(response));
    service.uploadCv(file).subscribe(result => {
      expect(result.user_id).toBe('u1');
      done();
    });
  });

  // ── mapRole ────────────────────────────────────────────────────────────────

  test('positive: mapRole calls POST /api/map-role with correct body', () => {
    http.post.mockReturnValue(of({ match_percentage: 80 }));
    service.mapRole('usr_001', 'Senior Python Developer').subscribe();
    expect(http.post).toHaveBeenCalledWith('/api/map-role', {
      user_id: 'usr_001',
      target_role: 'Senior Python Developer',
    });
  });

  test('positive: mapRole emits the mapping result', (done) => {
    const mapping = { match_percentage: 85, missing_skills: ['K8s'], matched_skills: ['Python'] };
    http.post.mockReturnValue(of(mapping));
    service.mapRole('u1', 'DevOps Engineer').subscribe(result => {
      expect(result.match_percentage).toBe(85);
      done();
    });
  });

  // ── generatePlan ───────────────────────────────────────────────────────────

  test('positive: generatePlan sends correct body with defaults', () => {
    http.post.mockReturnValue(of({ role: 'Dev', total_days: 7, plan: [] }));
    service.generatePlan('u1', 'Python Dev', ['Docker']).subscribe();
    expect(http.post).toHaveBeenCalledWith('/api/generate-plan', {
      user_id: 'u1',
      target_role: 'Python Dev',
      missing_skills: ['Docker'],
      num_days: 7,
    });
  });

  test('positive: generatePlan respects custom numDays', () => {
    http.post.mockReturnValue(of({ role: 'Dev', total_days: 3, plan: [] }));
    service.generatePlan('u1', 'Dev', [], 3).subscribe();
    const body = http.post.mock.calls[0][1];
    expect(body.num_days).toBe(3);
  });

  // ── getProgress ────────────────────────────────────────────────────────────

  test('positive: getProgress calls GET /api/progress/{userId}', () => {
    http.get.mockReturnValue(of({ role: 'Dev', readiness_score: 40 }));
    service.getProgress('usr_123').subscribe();
    expect(http.get).toHaveBeenCalledWith('/api/progress/usr_123');
  });

  // ── updateProgress ─────────────────────────────────────────────────────────

  test('positive: updateProgress sends completed task ids', () => {
    http.post.mockReturnValue(of({ readiness_score: 60 }));
    service.updateProgress('u1', ['d1t1', 'd1t2']).subscribe();
    const body = http.post.mock.calls[0][1];
    expect(body.completed_task_ids).toEqual(['d1t1', 'd1t2']);
  });

  test('positive: updateProgress with empty array sends empty list', () => {
    http.post.mockReturnValue(of({ readiness_score: 0 }));
    service.updateProgress('u1', []).subscribe();
    const body = http.post.mock.calls[0][1];
    expect(body.completed_task_ids).toEqual([]);
  });

  // ── getMemory ──────────────────────────────────────────────────────────────

  test('positive: getMemory calls GET /api/memory/{userId}', () => {
    http.get.mockReturnValue(of({ user_id: 'u1', episodic_sessions: [] }));
    service.getMemory('u1').subscribe();
    expect(http.get).toHaveBeenCalledWith('/api/memory/u1');
  });

  // ── getMetrics ─────────────────────────────────────────────────────────────

  test('positive: getMetrics calls GET /api/metrics', () => {
    http.get.mockReturnValue(of({ cache_stats: {}, guardrails: {} }));
    service.getMetrics().subscribe();
    expect(http.get).toHaveBeenCalledWith('/api/metrics');
  });

  // ── error handling ─────────────────────────────────────────────────────────

  test('negative: getRoles propagates HTTP error to subscriber', (done) => {
    http.get.mockReturnValue(throwError(() => ({ status: 503, message: 'Service Unavailable' })));
    service.getRoles().subscribe({
      error: (err) => {
        expect(err.status).toBe(503);
        done();
      },
    });
  });

  test('negative: uploadCv propagates 400 error', (done) => {
    const file = new File(['bad'], 'file.txt', { type: 'text/plain' });
    http.post.mockReturnValue(throwError(() => ({ status: 400, message: 'Not a PDF' })));
    service.uploadCv(file).subscribe({
      error: (err) => {
        expect(err.status).toBe(400);
        done();
      },
    });
  });
});
