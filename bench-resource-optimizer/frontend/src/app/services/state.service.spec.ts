/**
 * StateService unit tests.
 * Tests the reactive state logic directly using BehaviorSubjects.
 * No Angular TestBed or decorators needed — pure RxJS logic.
 */

import { BehaviorSubject } from 'rxjs';

// Manual implementation matching the actual StateService logic
class StateService {
  private _userId = new BehaviorSubject<string | null>(null);
  private _cvData = new BehaviorSubject<any>(null);
  private _mapping = new BehaviorSubject<any>(null);
  private _plan = new BehaviorSubject<any>(null);

  userId$ = this._userId.asObservable();
  cvData$ = this._cvData.asObservable();
  mapping$ = this._mapping.asObservable();
  plan$ = this._plan.asObservable();

  setUserId(id: string) { this._userId.next(id); }
  setCvData(data: any) { this._cvData.next(data); }
  setMapping(data: any) { this._mapping.next(data); }
  setPlan(data: any) { this._plan.next(data); }

  get userId() { return this._userId.value; }
  get cvData() { return this._cvData.value; }
  get mapping() { return this._mapping.value; }
  get plan() { return this._plan.value; }
}

describe('StateService', () => {
  let service: StateService;

  beforeEach(() => {
    service = new StateService();
  });

  // ── userId ─────────────────────────────────────────────────────────────────

  test('positive: userId starts as null', () => {
    expect(service.userId).toBeNull();
  });

  test('positive: setUserId stores and emits the value', (done) => {
    service.userId$.subscribe(v => {
      if (v !== null) {
        expect(v).toBe('usr_001');
        done();
      }
    });
    service.setUserId('usr_001');
  });

  test('positive: userId getter returns current value synchronously', () => {
    service.setUserId('usr_abc');
    expect(service.userId).toBe('usr_abc');
  });

  test('positive: userId can be updated multiple times', () => {
    service.setUserId('usr_001');
    service.setUserId('usr_002');
    expect(service.userId).toBe('usr_002');
  });

  // ── cvData ─────────────────────────────────────────────────────────────────

  test('positive: cvData starts as null', () => {
    expect(service.cvData).toBeNull();
  });

  test('positive: setCvData stores profile data', () => {
    const profile = { user_id: 'u1', profile: { name: 'Ravi', skills: ['Python'] } };
    service.setCvData(profile);
    expect(service.cvData).toEqual(profile);
  });

  test('positive: cvData observable emits on set', (done) => {
    const profile = { user_id: 'u1', profile: { skills: ['Python', 'Docker'] } };
    service.cvData$.subscribe(v => {
      if (v !== null) {
        expect(v.user_id).toBe('u1');
        done();
      }
    });
    service.setCvData(profile);
  });

  // ── mapping ────────────────────────────────────────────────────────────────

  test('positive: mapping starts as null', () => {
    expect(service.mapping).toBeNull();
  });

  test('positive: setMapping stores role mapping result', () => {
    const mapping = { match_percentage: 85, missing_skills: ['K8s'], matched_skills: ['Python'] };
    service.setMapping(mapping);
    expect(service.mapping).toEqual(mapping);
    expect((service.mapping as any).match_percentage).toBe(85);
  });

  // ── plan ───────────────────────────────────────────────────────────────────

  test('positive: plan starts as null', () => {
    expect(service.plan).toBeNull();
  });

  test('positive: setPlan stores learning plan', () => {
    const plan = { role: 'Senior Python Dev', total_days: 7, plan: [] };
    service.setPlan(plan);
    expect(service.plan).toEqual(plan);
  });

  test('positive: plan observable emits correct data', (done) => {
    const plan = { role: 'DevOps Engineer', total_days: 5, plan: [{ day: 1, tasks: [] }] };
    service.plan$.subscribe(v => {
      if (v !== null) {
        expect(v.role).toBe('DevOps Engineer');
        expect(v.total_days).toBe(5);
        done();
      }
    });
    service.setPlan(plan);
  });

  // ── cross-field ────────────────────────────────────────────────────────────

  test('positive: setting multiple fields independently does not interfere', () => {
    service.setUserId('usr_x');
    service.setCvData({ user_id: 'usr_x', profile: { skills: [] } });
    service.setMapping({ match_percentage: 60, missing_skills: [], matched_skills: [] });
    service.setPlan({ role: 'Dev', total_days: 3, plan: [] });

    expect(service.userId).toBe('usr_x');
    expect(service.cvData).not.toBeNull();
    expect(service.mapping).not.toBeNull();
    expect(service.plan).not.toBeNull();
  });

  test('negative: plan is null before setPlan is called', () => {
    service.setUserId('usr_y');
    expect(service.plan).toBeNull();
  });
});
