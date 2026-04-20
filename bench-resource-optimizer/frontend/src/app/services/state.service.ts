import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Plan, RoleMapping, UploadCvResponse } from '../models/types';

@Injectable({ providedIn: 'root' })
export class StateService {
  private _userId = new BehaviorSubject<string | null>(
    sessionStorage.getItem('userId')
  );
  private _cvData = new BehaviorSubject<UploadCvResponse | null>(null);
  private _mapping = new BehaviorSubject<RoleMapping | null>(null);
  private _plan = new BehaviorSubject<Plan | null>(null);

  userId$ = this._userId.asObservable();
  cvData$ = this._cvData.asObservable();
  mapping$ = this._mapping.asObservable();
  plan$ = this._plan.asObservable();

  setUserId(id: string) {
    sessionStorage.setItem('userId', id);
    this._userId.next(id);
  }
  setCvData(data: UploadCvResponse) { this._cvData.next(data); }
  setMapping(data: RoleMapping) { this._mapping.next(data); }
  setPlan(data: Plan) { this._plan.next(data); }

  get userId() { return this._userId.value; }
  get cvData() { return this._cvData.value; }
  get mapping() { return this._mapping.value; }
  get plan() { return this._plan.value; }
}
