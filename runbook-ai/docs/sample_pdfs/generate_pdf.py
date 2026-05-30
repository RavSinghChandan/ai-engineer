"""Generate a realistic Kubernetes pod crashloop recovery runbook PDF."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER

OUTPUT = "k8s-pod-crashloop-recovery.pdf"

doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=A4,
    rightMargin=2*cm, leftMargin=2*cm, topMargin=2.5*cm, bottomMargin=2.5*cm
)

styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    "Title", parent=styles["Heading1"],
    fontSize=20, spaceAfter=6, textColor=colors.HexColor("#1a1a2e")
)
meta_style = ParagraphStyle(
    "Meta", parent=styles["Normal"],
    fontSize=10, textColor=colors.HexColor("#666666"), spaceAfter=4
)
section_style = ParagraphStyle(
    "Section", parent=styles["Heading2"],
    fontSize=13, spaceBefore=14, spaceAfter=6, textColor=colors.HexColor("#0066cc")
)
body_style = ParagraphStyle(
    "Body", parent=styles["Normal"],
    fontSize=10, leading=16, spaceAfter=4
)
step_title_style = ParagraphStyle(
    "StepTitle", parent=styles["Normal"],
    fontSize=11, fontName="Helvetica-Bold", spaceBefore=10, spaceAfter=4
)
cmd_style = ParagraphStyle(
    "Cmd", parent=styles["Code"],
    fontSize=9, leading=14, backColor=colors.HexColor("#f4f4f4"),
    leftIndent=12, rightIndent=12, spaceBefore=4, spaceAfter=4,
    borderPadding=(4, 8, 4, 8)
)
note_style = ParagraphStyle(
    "Note", parent=styles["Normal"],
    fontSize=9, textColor=colors.HexColor("#8b6914"), leftIndent=12, spaceAfter=6
)

story = []

# ── Title block ───────────────────────────────────────────────────────────────
story.append(Paragraph("Kubernetes Pod CrashLoopBackOff Recovery Runbook", title_style))
story.append(Paragraph("Document ID: RB-K8S-001 | Version: 2.3 | Last Updated: 2024-11-15", meta_style))
story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#0066cc")))
story.append(Spacer(1, 0.3*cm))

# ── Metadata table ────────────────────────────────────────────────────────────
meta_data = [
    ["Category", "Kubernetes", "Severity", "P1 - Critical"],
    ["Domain", "Container Orchestration", "Est. Duration", "15-30 minutes"],
    ["Owner", "Platform Engineering", "Oncall Escalation", "#platform-oncall"],
    ["Tags", "kubernetes, pods, crashloop, containers, k8s", "", ""],
]
meta_table = Table(meta_data, colWidths=[3.5*cm, 6*cm, 3.5*cm, 5*cm])
meta_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#e8f1fb")),
    ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#e8f1fb")),
    ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
    ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 9),
    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
    ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.HexColor("#f9f9f9"), colors.white]),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("TOPPADDING", (0, 0), (-1, -1), 5),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
]))
story.append(meta_table)
story.append(Spacer(1, 0.4*cm))

# ── Overview ──────────────────────────────────────────────────────────────────
story.append(Paragraph("Overview", section_style))
story.append(Paragraph(
    "A CrashLoopBackOff occurs when a Kubernetes pod repeatedly fails to start. "
    "Kubernetes attempts to restart the container, but it crashes again immediately. "
    "The interval between restarts increases exponentially (10s, 20s, 40s, 80s, 160s, 300s max). "
    "Common causes include application startup errors, missing environment variables, "
    "insufficient memory/CPU, misconfigured liveness probes, or dependency failures.",
    body_style
))

# ── Prerequisites ─────────────────────────────────────────────────────────────
story.append(Paragraph("Prerequisites", section_style))
prereqs = [
    "• kubectl configured and connected to the target cluster",
    "• Read access to the affected namespace",
    "• Access to container registry for image verification",
    "• Slack access for #platform-oncall escalation channel",
]
for p in prereqs:
    story.append(Paragraph(p, body_style))
story.append(Spacer(1, 0.2*cm))

# ── Steps ─────────────────────────────────────────────────────────────────────
story.append(Paragraph("Response Steps", section_style))

# Step 1
story.append(Paragraph("Step 1: Identify the Affected Pod", step_title_style))
story.append(Paragraph(
    "List all pods in the namespace and filter for those in CrashLoopBackOff state. "
    "Note the pod name, restart count, and age for triage priority.",
    body_style
))
story.append(Paragraph("kubectl get pods -n <namespace> --field-selector=status.phase=Running", cmd_style))
story.append(Paragraph("kubectl get pods -n <namespace> | grep CrashLoopBackOff", cmd_style))
story.append(Paragraph(
    "NOTE: High restart counts (>10) indicate a persistent configuration issue, not a transient failure.",
    note_style
))

# Step 2
story.append(Paragraph("Step 2: Inspect Pod Events and Status", step_title_style))
story.append(Paragraph(
    "Describe the pod to view events, exit codes, and last state. "
    "The exit code reveals the root cause: 1=application error, 137=OOMKilled, 139=segfault.",
    body_style
))
story.append(Paragraph("kubectl describe pod <pod-name> -n <namespace>", cmd_style))
story.append(Paragraph("kubectl get events -n <namespace> --sort-by=.lastTimestamp | tail -20", cmd_style))

# Step 3
story.append(Paragraph("Step 3: Retrieve Container Logs", step_title_style))
story.append(Paragraph(
    "Fetch logs from the current container and the previous crashed container "
    "to identify the startup error or exception.",
    body_style
))
story.append(Paragraph("kubectl logs <pod-name> -n <namespace> --previous", cmd_style))
story.append(Paragraph("kubectl logs <pod-name> -n <namespace> -c <container-name> --tail=100", cmd_style))

# Step 4
story.append(Paragraph("Step 4: Check Resource Limits", step_title_style))
story.append(Paragraph(
    "OOMKilled (exit code 137) means the container exceeded its memory limit. "
    "Check current limits and node capacity before increasing.",
    body_style
))
story.append(Paragraph("kubectl top pods -n <namespace>", cmd_style))
story.append(Paragraph("kubectl top nodes", cmd_style))
story.append(Paragraph("kubectl get pod <pod-name> -n <namespace> -o jsonpath='{.spec.containers[*].resources}'", cmd_style))

# Step 5
story.append(Paragraph("Step 5: Verify Environment Variables and Secrets", step_title_style))
story.append(Paragraph(
    "Missing or misconfigured environment variables are a top cause of CrashLoopBackOff. "
    "Verify all required secrets and configmaps exist in the namespace.",
    body_style
))
story.append(Paragraph("kubectl get secrets -n <namespace>", cmd_style))
story.append(Paragraph("kubectl get configmaps -n <namespace>", cmd_style))
story.append(Paragraph("kubectl describe deployment <deployment-name> -n <namespace> | grep -A20 'Environment'", cmd_style))

# Step 6
story.append(Paragraph("Step 6: Scale Down and Redeploy", step_title_style))
story.append(Paragraph(
    "If a configuration change or image update is needed, scale the deployment to zero "
    "before applying changes. This prevents cascading restarts during the fix.",
    body_style
))
story.append(Paragraph("kubectl scale deployment <deployment-name> --replicas=0 -n <namespace>", cmd_style))
story.append(Paragraph("kubectl set image deployment/<deployment-name> <container>=<new-image>:<tag> -n <namespace>", cmd_style))
story.append(Paragraph("kubectl scale deployment <deployment-name> --replicas=3 -n <namespace>", cmd_style))

# Step 7
story.append(Paragraph("Step 7: Verify Recovery", step_title_style))
story.append(Paragraph(
    "Monitor the pod rollout to confirm all replicas reach Running state "
    "with zero restart count. Wait for the readiness probe to pass.",
    body_style
))
story.append(Paragraph("kubectl rollout status deployment/<deployment-name> -n <namespace>", cmd_style))
story.append(Paragraph("kubectl get pods -n <namespace> -w", cmd_style))
story.append(Paragraph(
    "SUCCESS criteria: All pods show STATUS=Running, RESTARTS=0, and READY=1/1 (or N/N).",
    note_style
))

# ── Rollback ──────────────────────────────────────────────────────────────────
story.append(Paragraph("Rollback Steps", section_style))
story.append(Paragraph(
    "If the new deployment does not recover, roll back to the previous stable version.",
    body_style
))

story.append(Paragraph("Rollback Step 1: Undo Deployment", step_title_style))
story.append(Paragraph("kubectl rollout undo deployment/<deployment-name> -n <namespace>", cmd_style))

story.append(Paragraph("Rollback Step 2: Verify Rollback", step_title_style))
story.append(Paragraph("kubectl rollout status deployment/<deployment-name> -n <namespace>", cmd_style))
story.append(Paragraph("kubectl rollout history deployment/<deployment-name> -n <namespace>", cmd_style))

story.append(Paragraph("Rollback Step 3: Alert Platform Team", step_title_style))
story.append(Paragraph(
    "Post incident summary to Slack #platform-oncall with: pod name, namespace, "
    "root cause, timeline, and rollback status.",
    body_style
))

# ── Escalation ────────────────────────────────────────────────────────────────
story.append(Paragraph("Escalation Path", section_style))
esc_data = [
    ["Time Without Resolution", "Action", "Contact"],
    ["0-15 min", "Follow this runbook", "On-call engineer"],
    ["15-30 min", "Escalate to platform lead", "#platform-oncall Slack"],
    ["30-60 min", "Declare P1 incident", "Engineering Manager + CTO"],
    [">60 min", "Invoke DR procedure", "VP Engineering"],
]
esc_table = Table(esc_data, colWidths=[5*cm, 6*cm, 6*cm])
esc_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0066cc")),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
    ("FONTSIZE", (0, 0), (-1, -1), 9),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#f9f9f9"), colors.white]),
    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
]))
story.append(esc_table)
story.append(Spacer(1, 0.4*cm))

# ── Dependencies ──────────────────────────────────────────────────────────────
story.append(Paragraph("Step Dependencies", section_style))
story.append(Paragraph(
    "Steps must be executed in sequence. Step 6 (Scale Down and Redeploy) depends on "
    "Step 4 (Resource Check) and Step 5 (Env Var Verification) completing successfully. "
    "Rollback steps depend on Step 6 having been attempted first.",
    body_style
))

dep_data = [
    ["Step", "Depends On", "Can Parallelize With"],
    ["Step 1: Identify Pod", "—", "—"],
    ["Step 2: Inspect Events", "Step 1", "—"],
    ["Step 3: Retrieve Logs", "Step 1", "Step 2"],
    ["Step 4: Check Resources", "Step 2, Step 3", "Step 5"],
    ["Step 5: Verify Env Vars", "Step 2, Step 3", "Step 4"],
    ["Step 6: Scale and Redeploy", "Step 4, Step 5", "—"],
    ["Step 7: Verify Recovery", "Step 6", "—"],
]
dep_table = Table(dep_data, colWidths=[5.5*cm, 5*cm, 6.5*cm])
dep_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
    ("FONTSIZE", (0, 0), (-1, -1), 9),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#f9f9f9"), colors.white]),
    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("TOPPADDING", (0, 0), (-1, -1), 5),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
]))
story.append(dep_table)
story.append(Spacer(1, 0.4*cm))

# ── Footer ────────────────────────────────────────────────────────────────────
story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#cccccc")))
story.append(Spacer(1, 0.2*cm))
story.append(Paragraph(
    "This runbook is maintained by the Platform Engineering team. "
    "For corrections or updates, open a PR to the runbooks repository or ping #platform-oncall.",
    ParagraphStyle("Footer", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor("#999999"))
))

doc.build(story)
print(f"PDF written: {OUTPUT}")
