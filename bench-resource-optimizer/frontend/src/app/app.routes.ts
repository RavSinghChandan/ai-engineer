import { Routes } from '@angular/router';
import { UploadCvComponent } from './components/upload-cv/upload-cv.component';
import { RoleMappingComponent } from './components/role-mapping/role-mapping.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { MetricsComponent } from './components/metrics/metrics.component';
import { AdminComponent } from './components/admin/admin.component';
import { AgentGraphComponent } from './components/agent-graph/agent-graph.component';
import { MemoryComponent } from './components/memory/memory.component';

export const routes: Routes = [
  { path: '', redirectTo: 'upload', pathMatch: 'full' },
  { path: 'upload',    component: UploadCvComponent },
  { path: 'mapping',   component: RoleMappingComponent },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'memory',    component: MemoryComponent },
  { path: 'metrics',   component: MetricsComponent },
  { path: 'admin',     component: AdminComponent },
  { path: 'graph',     component: AgentGraphComponent },
];
