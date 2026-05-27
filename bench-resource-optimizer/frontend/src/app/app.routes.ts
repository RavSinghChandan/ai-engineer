import { Routes } from '@angular/router';
import { authGuard, adminGuard } from './guards/auth.guard';
import { LoginComponent } from './components/login/login.component';
import { ProfileComponent } from './components/profile/profile.component';
import { UploadCvComponent } from './components/upload-cv/upload-cv.component';
import { RoleMappingComponent } from './components/role-mapping/role-mapping.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { MetricsComponent } from './components/metrics/metrics.component';
import { AdminComponent } from './components/admin/admin.component';
import { AgentGraphComponent } from './components/agent-graph/agent-graph.component';
import { MemoryComponent } from './components/memory/memory.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: '',      redirectTo: 'upload', pathMatch: 'full' },

  { path: 'profile',   component: ProfileComponent,    canActivate: [authGuard] },
  { path: 'upload',    component: UploadCvComponent,   canActivate: [authGuard] },
  { path: 'mapping',   component: RoleMappingComponent,canActivate: [authGuard] },
  { path: 'dashboard', component: DashboardComponent,  canActivate: [authGuard] },
  { path: 'memory',    component: MemoryComponent,     canActivate: [authGuard] },
  { path: 'metrics',   component: MetricsComponent,    canActivate: [authGuard] },
  { path: 'graph',     component: AgentGraphComponent, canActivate: [authGuard] },

  { path: 'admin', component: AdminComponent, canActivate: [authGuard, adminGuard] },
];
