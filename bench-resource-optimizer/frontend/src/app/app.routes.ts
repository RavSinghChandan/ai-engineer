import { Routes } from '@angular/router';
import { UploadCvComponent } from './components/upload-cv/upload-cv.component';
import { RoleMappingComponent } from './components/role-mapping/role-mapping.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';

export const routes: Routes = [
  { path: '', redirectTo: 'upload', pathMatch: 'full' },
  { path: 'upload', component: UploadCvComponent },
  { path: 'mapping', component: RoleMappingComponent },
  { path: 'dashboard', component: DashboardComponent },
];
