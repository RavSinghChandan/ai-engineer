"""Generate 10 enterprise-grade Kubernetes runbook PDFs."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.enums import TA_LEFT

styles = getSampleStyleSheet()

def make_styles():
    return {
        "title": ParagraphStyle("T", parent=styles["Heading1"], fontSize=18, spaceAfter=5, textColor=colors.HexColor("#1a1a2e")),
        "meta": ParagraphStyle("M", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#666666"), spaceAfter=3),
        "section": ParagraphStyle("S", parent=styles["Heading2"], fontSize=12, spaceBefore=12, spaceAfter=5, textColor=colors.HexColor("#0066cc")),
        "body": ParagraphStyle("B", parent=styles["Normal"], fontSize=10, leading=15, spaceAfter=4),
        "step_title": ParagraphStyle("ST", parent=styles["Normal"], fontSize=11, fontName="Helvetica-Bold", spaceBefore=9, spaceAfter=3),
        "cmd": ParagraphStyle("C", parent=styles["Code"], fontSize=8, leading=13, backColor=colors.HexColor("#f4f4f4"), leftIndent=10, rightIndent=10, spaceBefore=3, spaceAfter=3, borderPadding=(3, 6, 3, 6)),
        "note": ParagraphStyle("N", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#7a4500"), leftIndent=10, spaceAfter=5),
    }

def build_doc(filename, title, doc_id, category, severity, domain, duration, tags, overview, prereqs, steps, rollback_steps, dependencies):
    S = make_styles()
    doc = SimpleDocTemplate(filename, pagesize=A4, rightMargin=2*cm, leftMargin=2*cm, topMargin=2.2*cm, bottomMargin=2.2*cm)
    story = []

    story.append(Paragraph(title, S["title"]))
    story.append(Paragraph(f"Document ID: {doc_id} | Version: 1.0 | Last Updated: 2024-11-15", S["meta"]))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#0066cc")))
    story.append(Spacer(1, 0.25*cm))

    meta_data = [
        ["Category", category, "Severity", severity],
        ["Domain", domain, "Est. Duration", duration],
        ["Tags", tags, "", ""],
    ]
    mt = Table(meta_data, colWidths=[3.2*cm, 6.2*cm, 3.2*cm, 5.4*cm])
    mt.setStyle(TableStyle([
        ("BACKGROUND", (0,0),(0,-1), colors.HexColor("#e8f1fb")),
        ("BACKGROUND", (2,0),(2,-1), colors.HexColor("#e8f1fb")),
        ("FONTNAME", (0,0),(-1,-1), "Helvetica"),
        ("FONTNAME", (0,0),(0,-1), "Helvetica-Bold"),
        ("FONTNAME", (2,0),(2,-1), "Helvetica-Bold"),
        ("FONTSIZE", (0,0),(-1,-1), 9),
        ("GRID", (0,0),(-1,-1), 0.5, colors.HexColor("#cccccc")),
        ("ROWBACKGROUNDS",(0,0),(-1,-1),[colors.HexColor("#f9f9f9"), colors.white]),
        ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
        ("TOPPADDING",(0,0),(-1,-1),4), ("BOTTOMPADDING",(0,0),(-1,-1),4),
    ]))
    story.append(mt)
    story.append(Spacer(1, 0.3*cm))

    story.append(Paragraph("Overview", S["section"]))
    story.append(Paragraph(overview, S["body"]))

    story.append(Paragraph("Prerequisites", S["section"]))
    for p in prereqs:
        story.append(Paragraph(f"• {p}", S["body"]))

    story.append(Paragraph("Response Steps", S["section"]))
    for i, step in enumerate(steps, 1):
        story.append(Paragraph(f"Step {i}: {step['title']}", S["step_title"]))
        story.append(Paragraph(step["desc"], S["body"]))
        for cmd in step["cmds"]:
            story.append(Paragraph(cmd, S["cmd"]))
        if step.get("note"):
            story.append(Paragraph(f"NOTE: {step['note']}", S["note"]))

    story.append(Paragraph("Rollback Steps", S["section"]))
    for i, step in enumerate(rollback_steps, 1):
        story.append(Paragraph(f"Rollback Step {i}: {step['title']}", S["step_title"]))
        story.append(Paragraph(step["desc"], S["body"]))
        for cmd in step["cmds"]:
            story.append(Paragraph(cmd, S["cmd"]))

    story.append(Paragraph("Step Dependencies", S["section"]))
    dep_data = [["Step", "Depends On", "Can Parallelize With"]] + dependencies
    dt = Table(dep_data, colWidths=[5.5*cm, 5*cm, 6.5*cm])
    dt.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,0), colors.HexColor("#1a1a2e")),
        ("TEXTCOLOR",(0,0),(-1,0), colors.white),
        ("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),
        ("FONTNAME",(0,1),(-1,-1),"Helvetica"),
        ("FONTSIZE",(0,0),(-1,-1),9),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.HexColor("#f9f9f9"), colors.white]),
        ("GRID",(0,0),(-1,-1),0.5,colors.HexColor("#cccccc")),
        ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
        ("TOPPADDING",(0,0),(-1,-1),4), ("BOTTOMPADDING",(0,0),(-1,-1),4),
    ]))
    story.append(dt)
    story.append(Spacer(1, 0.3*cm))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#cccccc")))
    story.append(Paragraph("Maintained by Platform Engineering. For updates ping #platform-oncall.",
        ParagraphStyle("F", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor("#999999"))))

    doc.build(story)
    print(f"  ✓ {filename}")


RUNBOOKS = [

# ── 1. OOMKilled ──────────────────────────────────────────────────────────────
dict(
    filename="k8s-oomkilled-recovery.pdf",
    title="Kubernetes OOMKilled Pod Recovery Runbook",
    doc_id="RB-K8S-002", category="kubernetes", severity="P1 - Critical",
    domain="Container Orchestration", duration="20-40 minutes",
    tags="kubernetes, oomkilled, memory, limits, containers",
    overview=(
        "OOMKilled (Out of Memory Killed) occurs when a container exceeds its memory limit and the Linux kernel "
        "OOM killer terminates the process. Exit code is 137. This runbook covers diagnosis, immediate mitigation "
        "by adjusting memory limits, and long-term remediation through application profiling."
    ),
    prereqs=[
        "kubectl configured and connected to the target cluster",
        "Access to Prometheus/Grafana for memory metrics",
        "Permission to edit Deployments in the affected namespace",
        "Helm (if deployment managed via Helm chart)",
    ],
    steps=[
        dict(title="Confirm OOMKilled Exit Code",
             desc="Describe the pod and confirm the last state shows OOMKilled with exit code 137.",
             cmds=["kubectl describe pod <pod-name> -n <namespace> | grep -A10 'Last State'",
                   "kubectl get pod <pod-name> -n <namespace> -o jsonpath='{.status.containerStatuses[0].lastState}'"],
             note="Exit code 137 = OOMKilled. Exit code 1 = application crash. Do not confuse the two."),
        dict(title="Check Current Memory Limits",
             desc="Retrieve the current resource requests and limits for the affected deployment.",
             cmds=["kubectl get deployment <deployment-name> -n <namespace> -o jsonpath='{.spec.template.spec.containers[*].resources}'",
                   "kubectl top pods -n <namespace> --sort-by=memory"],
             note=None),
        dict(title="Review Memory Metrics",
             desc="Query Prometheus for the container's actual memory usage over the past 24 hours to determine the correct new limit.",
             cmds=["kubectl port-forward svc/prometheus-operated 9090:9090 -n monitoring &",
                   "# Query: container_memory_working_set_bytes{namespace='<namespace>',pod=~'<deployment>.*'}"],
             note="Set the new limit to peak usage + 25% headroom."),
        dict(title="Patch Memory Limits",
             desc="Update the deployment with a higher memory limit. Use kubectl patch for a targeted change without redeploying.",
             cmds=["kubectl patch deployment <deployment-name> -n <namespace> --type='json' -p='[{\"op\":\"replace\",\"path\":\"/spec/template/spec/containers/0/resources/limits/memory\",\"value\":\"512Mi\"}]'",
                   "kubectl patch deployment <deployment-name> -n <namespace> --type='json' -p='[{\"op\":\"replace\",\"path\":\"/spec/template/spec/containers/0/resources/requests/memory\",\"value\":\"256Mi\"}]'"],
             note=None),
        dict(title="Monitor Pod Restart",
             desc="Watch the rollout and confirm new pods start without OOMKilled.",
             cmds=["kubectl rollout status deployment/<deployment-name> -n <namespace>",
                   "kubectl get pods -n <namespace> -w"],
             note="SUCCESS: All pods Running with RESTARTS=0 for at least 5 minutes."),
        dict(title="Verify Memory Usage Post-Fix",
             desc="Confirm actual memory usage is within the new limits after the fix.",
             cmds=["kubectl top pods -n <namespace>",
                   "kubectl describe pod <new-pod-name> -n <namespace> | grep -A5 'Limits'"],
             note=None),
    ],
    rollback_steps=[
        dict(title="Revert Limit Patch",
             desc="If the new limit causes resource starvation on the node, revert to the previous value.",
             cmds=["kubectl rollout undo deployment/<deployment-name> -n <namespace>"]),
        dict(title="Cordon Node if Node Pressure",
             desc="If the node is under memory pressure, cordon it to prevent further scheduling.",
             cmds=["kubectl cordon <node-name>",
                   "kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data"]),
    ],
    dependencies=[
        ["Step 1: Confirm OOMKilled", "—", "—"],
        ["Step 2: Check Limits", "Step 1", "—"],
        ["Step 3: Review Metrics", "Step 1", "Step 2"],
        ["Step 4: Patch Limits", "Step 2, Step 3", "—"],
        ["Step 5: Monitor Restart", "Step 4", "—"],
        ["Step 6: Verify Post-Fix", "Step 5", "—"],
    ]
),

# ── 2. Node Not Ready ─────────────────────────────────────────────────────────
dict(
    filename="k8s-node-not-ready.pdf",
    title="Kubernetes Node NotReady Recovery Runbook",
    doc_id="RB-K8S-003", category="kubernetes", severity="P1 - Critical",
    domain="Container Orchestration", duration="30-60 minutes",
    tags="kubernetes, node, notready, kubelet, drain, cordon",
    overview=(
        "A NotReady node means the kubelet on that node has stopped reporting to the API server. "
        "All pods on the node are evicted or stuck in Terminating state. This affects all workloads "
        "scheduled on the node and may cause cascading failures if multiple nodes are affected."
    ),
    prereqs=[
        "SSH access to the affected node",
        "kubectl with cluster-admin permissions",
        "Node group auto-scaling access (AWS/GCP/Azure)",
        "Access to node system logs (journald or /var/log)",
    ],
    steps=[
        dict(title="Identify the NotReady Node",
             desc="List all nodes and identify which ones are in NotReady state and how long they have been down.",
             cmds=["kubectl get nodes -o wide",
                   "kubectl get nodes --no-headers | grep -v Ready"],
             note="Note the AGE column — a node down >5 minutes has likely evicted its pods already."),
        dict(title="Describe Node for Root Cause",
             desc="Inspect node conditions, resource pressure, and recent events to determine whether it is a disk, memory, or network issue.",
             cmds=["kubectl describe node <node-name>",
                   "kubectl get events --field-selector involvedObject.name=<node-name> -A"],
             note=None),
        dict(title="SSH to Node and Check Kubelet",
             desc="SSH to the node and check kubelet service status. Most NotReady conditions are caused by a stopped or crashed kubelet.",
             cmds=["ssh <node-ip>",
                   "systemctl status kubelet",
                   "journalctl -u kubelet -n 50 --no-pager"],
             note=None),
        dict(title="Restart Kubelet if Stopped",
             desc="If kubelet is stopped or failed, restart it and check it returns to active state.",
             cmds=["systemctl restart kubelet",
                   "systemctl status kubelet",
                   "sleep 30 && kubectl get node <node-name>"],
             note="Allow 30 seconds for the node to re-register with the API server."),
        dict(title="Check Disk and Memory Pressure",
             desc="If kubelet is running but node is still NotReady, check for DiskPressure or MemoryPressure conditions.",
             cmds=["df -h",
                   "free -m",
                   "du -sh /var/lib/docker/* | sort -rh | head -10"],
             note=None),
        dict(title="Cordon and Drain if Unrecoverable",
             desc="If the node cannot be recovered quickly, cordon it to stop new scheduling and drain all pods to healthy nodes.",
             cmds=["kubectl cordon <node-name>",
                   "kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data --force",
                   "kubectl get pods -A -o wide | grep <node-name>"],
             note=None),
        dict(title="Replace Node via Node Group",
             desc="Terminate the unrecoverable node via the cloud provider. The auto-scaler will provision a replacement.",
             cmds=["# AWS: aws ec2 terminate-instances --instance-ids <instance-id>",
                   "# GCP: gcloud compute instances delete <node-name> --zone=<zone>",
                   "kubectl get nodes -w"],
             note="SUCCESS: New node appears in Ready state within 3-5 minutes."),
    ],
    rollback_steps=[
        dict(title="Uncordon Node if Recovered",
             desc="If the node recovered after kubelet restart, uncordon it to resume scheduling.",
             cmds=["kubectl uncordon <node-name>",
                   "kubectl get node <node-name>"]),
        dict(title="Re-schedule Critical Pods",
             desc="If critical pods did not reschedule automatically, delete them to trigger rescheduling.",
             cmds=["kubectl get pods -A -o wide | grep Pending",
                   "kubectl delete pod <stuck-pod> -n <namespace>"]),
    ],
    dependencies=[
        ["Step 1: Identify Node", "—", "—"],
        ["Step 2: Describe Node", "Step 1", "—"],
        ["Step 3: SSH + Check Kubelet", "Step 1", "Step 2"],
        ["Step 4: Restart Kubelet", "Step 3", "—"],
        ["Step 5: Check Disk/Memory", "Step 3", "Step 4"],
        ["Step 6: Cordon and Drain", "Step 4, Step 5", "—"],
        ["Step 7: Replace Node", "Step 6", "—"],
    ]
),

# ── 3. Deployment Rollout Stuck ───────────────────────────────────────────────
dict(
    filename="k8s-deployment-rollout-stuck.pdf",
    title="Kubernetes Deployment Rollout Stuck Runbook",
    doc_id="RB-K8S-004", category="kubernetes", severity="P2 - High",
    domain="Container Orchestration", duration="15-30 minutes",
    tags="kubernetes, deployment, rollout, stuck, pending, imagepullbackoff",
    overview=(
        "A stuck rollout means a Deployment has started updating pods but the new ReplicaSet "
        "cannot reach its desired replica count. Old pods remain Running while new pods are stuck "
        "in Pending, ImagePullBackOff, or CrashLoopBackOff. This blocks all future deployments until resolved."
    ),
    prereqs=[
        "kubectl configured for the target cluster",
        "Access to container registry credentials",
        "Deployment history access (kubectl rollout history)",
    ],
    steps=[
        dict(title="Check Rollout Status",
             desc="Confirm the rollout is stuck and identify which deployment version is affected.",
             cmds=["kubectl rollout status deployment/<deployment-name> -n <namespace>",
                   "kubectl rollout history deployment/<deployment-name> -n <namespace>"],
             note="A stuck rollout shows 'Waiting for deployment to finish' indefinitely."),
        dict(title="Inspect New ReplicaSet Pods",
             desc="Find the new ReplicaSet created by the rollout and check why its pods are not starting.",
             cmds=["kubectl get rs -n <namespace> | grep <deployment-name>",
                   "kubectl get pods -n <namespace> -l app=<app-label>",
                   "kubectl describe pod <new-pod-name> -n <namespace>"],
             note=None),
        dict(title="Check for ImagePullBackOff",
             desc="If the new pod shows ImagePullBackOff, the image tag does not exist in the registry or credentials are missing.",
             cmds=["kubectl get pod <pod-name> -n <namespace> -o jsonpath='{.status.containerStatuses[0].image}'",
                   "kubectl get secret regcred -n <namespace>",
                   "kubectl describe pod <pod-name> -n <namespace> | grep -A5 'Events'"],
             note="Fix: correct the image tag or re-create the imagePullSecret."),
        dict(title="Check for Resource Quota Exhaustion",
             desc="If pods are stuck in Pending, the namespace may have hit its ResourceQuota for CPU or memory.",
             cmds=["kubectl describe resourcequota -n <namespace>",
                   "kubectl get events -n <namespace> | grep FailedCreate",
                   "kubectl describe nodes | grep -A5 'Allocated resources'"],
             note=None),
        dict(title="Check PodDisruptionBudget",
             desc="A PDB with minAvailable = replicas will block the rollout from terminating old pods.",
             cmds=["kubectl get pdb -n <namespace>",
                   "kubectl describe pdb <pdb-name> -n <namespace>"],
             note="If PDB is blocking, temporarily patch minAvailable to allow the rollout to proceed."),
        dict(title="Pause and Resume or Rollback",
             desc="If the root cause is fixed, resume the rollout. If not fixable quickly, roll back to the previous version.",
             cmds=["# To resume after fixing image/quota:",
                   "kubectl rollout resume deployment/<deployment-name> -n <namespace>",
                   "# To roll back:",
                   "kubectl rollout undo deployment/<deployment-name> -n <namespace>"],
             note=None),
    ],
    rollback_steps=[
        dict(title="Roll Back to Previous Version",
             desc="Roll back to the last known good revision.",
             cmds=["kubectl rollout undo deployment/<deployment-name> -n <namespace>",
                   "kubectl rollout status deployment/<deployment-name> -n <namespace>"]),
        dict(title="Pin to Specific Revision",
             desc="If the immediate previous version also had issues, roll back to a specific revision.",
             cmds=["kubectl rollout undo deployment/<deployment-name> -n <namespace> --to-revision=<N>",
                   "kubectl rollout history deployment/<deployment-name> -n <namespace>"]),
    ],
    dependencies=[
        ["Step 1: Check Rollout Status", "—", "—"],
        ["Step 2: Inspect New RS Pods", "Step 1", "—"],
        ["Step 3: Check ImagePullBackOff", "Step 2", "Step 4"],
        ["Step 4: Check Resource Quota", "Step 2", "Step 3"],
        ["Step 5: Check PDB", "Step 2", "Step 3, Step 4"],
        ["Step 6: Pause/Resume/Rollback", "Step 3, Step 4, Step 5", "—"],
    ]
),

# ── 4. Persistent Volume Claim Pending ───────────────────────────────────────
dict(
    filename="k8s-pvc-pending.pdf",
    title="Kubernetes PersistentVolumeClaim Pending Recovery Runbook",
    doc_id="RB-K8S-005", category="kubernetes", severity="P2 - High",
    domain="Container Orchestration", duration="20-35 minutes",
    tags="kubernetes, pvc, persistentvolume, storage, pending, storageclass",
    overview=(
        "A PersistentVolumeClaim stuck in Pending state means Kubernetes cannot bind a PersistentVolume "
        "to satisfy the claim. Any pod that mounts this PVC will also be stuck in Pending. Common causes: "
        "no matching StorageClass, insufficient storage capacity, access mode mismatch, or missing CSI driver."
    ),
    prereqs=[
        "kubectl with cluster-admin or storage-admin permissions",
        "Access to the cloud provider console (AWS/GCP/Azure) for volume verification",
        "Knowledge of the StorageClass provisioner in use",
    ],
    steps=[
        dict(title="Identify the Pending PVC",
             desc="List all PVCs in the namespace and confirm which ones are stuck in Pending state.",
             cmds=["kubectl get pvc -n <namespace>",
                   "kubectl describe pvc <pvc-name> -n <namespace>"],
             note="The Events section of describe output reveals the exact binding failure reason."),
        dict(title="Check StorageClass Exists",
             desc="Verify the StorageClass referenced in the PVC spec exists in the cluster.",
             cmds=["kubectl get storageclass",
                   "kubectl describe storageclass <storageclass-name>"],
             note=None),
        dict(title="Check Available PersistentVolumes",
             desc="Look for unbound PVs that match the PVC's access mode, storage class, and capacity.",
             cmds=["kubectl get pv",
                   "kubectl get pv -o custom-columns='NAME:.metadata.name,CAPACITY:.spec.capacity.storage,ACCESS:.spec.accessModes,STATUS:.status.phase,CLAIM:.spec.claimRef.name'"],
             note=None),
        dict(title="Check CSI Driver Status",
             desc="If using a CSI driver (EBS, GCE PD, Azure Disk), verify the CSI pods are running in kube-system.",
             cmds=["kubectl get pods -n kube-system | grep csi",
                   "kubectl describe pod <csi-driver-pod> -n kube-system"],
             note=None),
        dict(title="Check Node Affinity Constraints",
             desc="If the PVC has a WaitForFirstConsumer binding mode, it binds only when a pod is scheduled. Check pod scheduling constraints.",
             cmds=["kubectl get storageclass <storageclass-name> -o jsonpath='{.volumeBindingMode}'",
                   "kubectl get pods -n <namespace> | grep Pending",
                   "kubectl describe pod <pending-pod> -n <namespace> | grep -A10 'Events'"],
             note="WaitForFirstConsumer is normal — the PVC binds when the pod is scheduled to a node."),
        dict(title="Manually Create PV if Dynamic Provisioning Fails",
             desc="If the provisioner is not creating PVs, manually create a PV that matches the PVC requirements.",
             cmds=["# Create a PV manifest and apply:",
                   "kubectl apply -f pv-manual.yaml",
                   "kubectl get pvc <pvc-name> -n <namespace>"],
             note="Manual PVs must exactly match: storageClassName, accessModes, capacity, and volumeMode."),
    ],
    rollback_steps=[
        dict(title="Delete and Recreate PVC",
             desc="If the PVC spec was misconfigured, delete it and recreate with corrected StorageClass or capacity.",
             cmds=["kubectl delete pvc <pvc-name> -n <namespace>",
                   "kubectl apply -f corrected-pvc.yaml"]),
        dict(title="Restore from Volume Snapshot",
             desc="If data loss occurred, restore the PVC from the most recent VolumeSnapshot.",
             cmds=["kubectl get volumesnapshot -n <namespace>",
                   "kubectl apply -f restore-from-snapshot.yaml"]),
    ],
    dependencies=[
        ["Step 1: Identify Pending PVC", "—", "—"],
        ["Step 2: Check StorageClass", "Step 1", "Step 3"],
        ["Step 3: Check Available PVs", "Step 1", "Step 2"],
        ["Step 4: Check CSI Driver", "Step 1", "Step 2, Step 3"],
        ["Step 5: Check Node Affinity", "Step 2", "Step 4"],
        ["Step 6: Manually Create PV", "Step 2, Step 3, Step 4", "—"],
    ]
),

# ── 5. Kubernetes Cluster Certificate Expiry ──────────────────────────────────
dict(
    filename="k8s-certificate-expiry.pdf",
    title="Kubernetes Cluster Certificate Expiry Runbook",
    doc_id="RB-K8S-006", category="kubernetes", severity="P1 - Critical",
    domain="Container Orchestration", duration="45-90 minutes",
    tags="kubernetes, certificates, tls, expiry, kubeadm, apiserver, etcd",
    overview=(
        "Expired Kubernetes certificates cause the API server, etcd, and kubelets to reject connections, "
        "making the cluster completely unmanageable. kubeadm-provisioned clusters have 1-year certificate validity. "
        "This runbook covers detection, renewal via kubeadm, and verification. Act before expiry — renewal requires API access."
    ),
    prereqs=[
        "SSH access to all control plane nodes",
        "kubeadm installed on control plane nodes",
        "Root/sudo access on control plane nodes",
        "Backup of /etc/kubernetes/pki directory",
    ],
    steps=[
        dict(title="Check Certificate Expiry Dates",
             desc="Check all cluster certificates and identify which ones have expired or will expire soon.",
             cmds=["kubeadm certs check-expiration",
                   "# Manual check for specific cert:",
                   "openssl x509 -in /etc/kubernetes/pki/apiserver.crt -noout -enddate"],
             note="Certificates expiring within 30 days should be renewed proactively during a maintenance window."),
        dict(title="Backup Existing Certificates",
             desc="Before renewing, backup all existing certificates and kubeconfig files.",
             cmds=["cp -r /etc/kubernetes/pki /etc/kubernetes/pki.bak.$(date +%Y%m%d)",
                   "cp /etc/kubernetes/admin.conf /etc/kubernetes/admin.conf.bak",
                   "ls -la /etc/kubernetes/pki.bak.*"],
             note=None),
        dict(title="Renew All Certificates",
             desc="Use kubeadm to renew all certificates at once. This updates all certs in /etc/kubernetes/pki.",
             cmds=["kubeadm certs renew all",
                   "kubeadm certs check-expiration"],
             note="Renewed certs will not take effect until the API server and controller-manager are restarted."),
        dict(title="Restart Control Plane Components",
             desc="The API server and controller-manager read certs at startup. Restart them to load the new certs.",
             cmds=["# For kubeadm static pods, move and restore manifests to force restart:",
                   "mv /etc/kubernetes/manifests/kube-apiserver.yaml /tmp/",
                   "sleep 20",
                   "mv /tmp/kube-apiserver.yaml /etc/kubernetes/manifests/",
                   "sleep 30 && kubectl get nodes"],
             note=None),
        dict(title="Update kubeconfig Files",
             desc="The admin.conf kubeconfig contains the embedded client certificate. Regenerate it.",
             cmds=["kubeadm init phase kubeconfig admin",
                   "cp /etc/kubernetes/admin.conf ~/.kube/config",
                   "kubectl cluster-info"],
             note=None),
        dict(title="Restart Kubelet on All Nodes",
             desc="Each node's kubelet uses its own certificate to communicate with the API server. Restart kubelet on all nodes.",
             cmds=["# On each node (control plane + workers):",
                   "systemctl restart kubelet",
                   "systemctl status kubelet",
                   "kubectl get nodes"],
             note="SUCCESS: All nodes return to Ready state and kubectl commands work normally."),
    ],
    rollback_steps=[
        dict(title="Restore Backup Certificates",
             desc="If renewal caused issues, restore the backed-up certificates.",
             cmds=["cp -r /etc/kubernetes/pki.bak.<date> /etc/kubernetes/pki",
                   "systemctl restart kubelet"]),
        dict(title="Emergency API Server Access",
             desc="If the API server is unreachable, access etcd directly to diagnose.",
             cmds=["ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key member list"]),
    ],
    dependencies=[
        ["Step 1: Check Expiry", "—", "—"],
        ["Step 2: Backup Certs", "Step 1", "—"],
        ["Step 3: Renew All Certs", "Step 2", "—"],
        ["Step 4: Restart Control Plane", "Step 3", "—"],
        ["Step 5: Update kubeconfig", "Step 3", "Step 4"],
        ["Step 6: Restart Kubelet", "Step 4, Step 5", "—"],
    ]
),

# ── 6. Kubernetes Ingress 503 ─────────────────────────────────────────────────
dict(
    filename="k8s-ingress-503.pdf",
    title="Kubernetes Ingress 503 Service Unavailable Runbook",
    doc_id="RB-K8S-007", category="kubernetes", severity="P2 - High",
    domain="Container Orchestration", duration="15-30 minutes",
    tags="kubernetes, ingress, nginx, 503, service, endpoints, loadbalancer",
    overview=(
        "A 503 Service Unavailable from an Ingress controller means the backend Service has no healthy endpoints. "
        "This is distinct from a 502 (bad gateway — pods are up but returning errors) or a 404 (no routing rule). "
        "Common causes: all pods down, Service selector mismatch, readiness probe failing, or wrong port mapping."
    ),
    prereqs=[
        "kubectl configured for the cluster",
        "Access to Ingress controller logs (nginx-ingress or similar)",
        "curl or browser access to the failing endpoint",
    ],
    steps=[
        dict(title="Confirm 503 and Check Ingress Rule",
             desc="Verify the error and check the Ingress resource is correctly configured with the right host and path.",
             cmds=["curl -v https://<hostname>/<path>",
                   "kubectl get ingress -n <namespace>",
                   "kubectl describe ingress <ingress-name> -n <namespace>"],
             note=None),
        dict(title="Check Backend Service and Endpoints",
             desc="Inspect the Service the Ingress points to and verify it has at least one healthy endpoint.",
             cmds=["kubectl get service <service-name> -n <namespace>",
                   "kubectl get endpoints <service-name> -n <namespace>",
                   "kubectl describe endpoints <service-name> -n <namespace>"],
             note="Empty endpoints (no IP addresses listed) means no pods match the Service selector."),
        dict(title="Check Pod Selector Match",
             desc="Verify the Service's label selector matches the labels on the pods.",
             cmds=["kubectl get service <service-name> -n <namespace> -o jsonpath='{.spec.selector}'",
                   "kubectl get pods -n <namespace> --show-labels",
                   "kubectl get pods -n <namespace> -l <key>=<value>"],
             note=None),
        dict(title="Check Readiness Probe",
             desc="If pods are running but not in endpoints, the readiness probe is failing. Inspect and fix it.",
             cmds=["kubectl describe pod <pod-name> -n <namespace> | grep -A10 'Readiness'",
                   "kubectl logs <pod-name> -n <namespace> | tail -50",
                   "kubectl get pod <pod-name> -n <namespace> -o jsonpath='{.status.conditions}'"],
             note="A pod is removed from endpoints when its readiness probe fails, even if it is Running."),
        dict(title="Check Ingress Controller Logs",
             desc="Inspect nginx-ingress or traefik logs for the specific error being returned.",
             cmds=["kubectl get pods -n ingress-nginx",
                   "kubectl logs -n ingress-nginx <ingress-controller-pod> | grep <hostname> | tail -30",
                   "kubectl logs -n ingress-nginx <ingress-controller-pod> --previous | tail -30"],
             note=None),
        dict(title="Restart Pods and Verify",
             desc="Restart the backend pods to clear transient readiness failures and verify endpoints populate.",
             cmds=["kubectl rollout restart deployment/<deployment-name> -n <namespace>",
                   "kubectl get endpoints <service-name> -n <namespace> -w",
                   "curl -v https://<hostname>/<path>"],
             note="SUCCESS: Endpoints show pod IPs and the URL returns 200 OK."),
    ],
    rollback_steps=[
        dict(title="Roll Back Deployment",
             desc="If a recent deployment caused the 503, roll back.",
             cmds=["kubectl rollout undo deployment/<deployment-name> -n <namespace>",
                   "kubectl get endpoints <service-name> -n <namespace>"]),
        dict(title="Patch Readiness Probe",
             desc="If the readiness probe is too strict, patch it with a longer timeout.",
             cmds=["kubectl patch deployment <deployment-name> -n <namespace> --type='json' -p='[{\"op\":\"replace\",\"path\":\"/spec/template/spec/containers/0/readinessProbe/timeoutSeconds\",\"value\":10}]'"]),
    ],
    dependencies=[
        ["Step 1: Confirm 503 + Ingress", "—", "—"],
        ["Step 2: Check Service + Endpoints", "Step 1", "—"],
        ["Step 3: Check Pod Selector", "Step 2", "Step 4"],
        ["Step 4: Check Readiness Probe", "Step 2", "Step 3"],
        ["Step 5: Check Ingress Logs", "Step 1", "Step 2, Step 3, Step 4"],
        ["Step 6: Restart + Verify", "Step 3, Step 4, Step 5", "—"],
    ]
),

# ── 7. etcd Disk Full ─────────────────────────────────────────────────────────
dict(
    filename="k8s-etcd-disk-full.pdf",
    title="Kubernetes etcd Disk Full / Quota Exceeded Runbook",
    doc_id="RB-K8S-008", category="kubernetes", severity="P1 - Critical",
    domain="Container Orchestration", duration="30-60 minutes",
    tags="kubernetes, etcd, disk, quota, defrag, compaction, control-plane",
    overview=(
        "etcd enforces a storage quota (default 2GB). When the quota is exceeded, etcd enters a read-only "
        "alarm state, rejecting all write operations. This makes the Kubernetes API server read-only — "
        "no new pods, deployments, or config changes can be applied. Immediate action required."
    ),
    prereqs=[
        "SSH access to etcd control plane nodes",
        "etcdctl installed and ETCDCTL_API=3 set",
        "etcd TLS certificates accessible",
        "Cluster maintenance window (API writes will be down during compaction)",
    ],
    steps=[
        dict(title="Confirm etcd Alarm State",
             desc="Check if etcd has triggered the NOSPACE alarm that causes read-only mode.",
             cmds=["ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key alarm list",
                   "ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key endpoint status"],
             note="ALARM: NOSPACE confirms the quota is exceeded."),
        dict(title="Check etcd Disk Usage",
             desc="Verify the actual disk usage and available space on the etcd data directory.",
             cmds=["df -h /var/lib/etcd",
                   "du -sh /var/lib/etcd/member/",
                   "ls -lh /var/lib/etcd/member/snap/"],
             note=None),
        dict(title="Compact etcd Revision History",
             desc="Compact old revision history. etcd keeps all historical revisions — compaction removes all revisions below the specified one.",
             cmds=["# Get current revision:",
                   "ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key endpoint status --write-out=json | python3 -c \"import sys,json; print(json.load(sys.stdin)[0]['Status']['header']['revision'])\"",
                   "# Compact to current revision (replace <REV>):",
                   "ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key compact <REV>"],
             note="Compaction is safe — it only removes old revision data, not current state."),
        dict(title="Defragment etcd",
             desc="After compaction, defragment to reclaim the physical disk space. Do each etcd member one at a time.",
             cmds=["ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key defrag",
                   "df -h /var/lib/etcd"],
             note="Defrag takes etcd offline briefly for that member. Do NOT defrag all members simultaneously."),
        dict(title="Disarm the NOSPACE Alarm",
             desc="After freeing space, disarm the alarm to restore write access.",
             cmds=["ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key alarm disarm",
                   "ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key alarm list"],
             note="SUCCESS: alarm list returns empty. kubectl commands now work normally."),
        dict(title="Increase etcd Quota Limit",
             desc="Increase the etcd quota to prevent recurrence. Edit the etcd static pod manifest.",
             cmds=["# Edit /etc/kubernetes/manifests/etcd.yaml and add/update:",
                   "# - --quota-backend-bytes=8589934592  (8GB)",
                   "vi /etc/kubernetes/manifests/etcd.yaml",
                   "# etcd will restart automatically"],
             note="Recommended: set to 4-8GB depending on cluster size. Maximum supported is 8GB."),
    ],
    rollback_steps=[
        dict(title="Restore etcd from Snapshot",
             desc="If compaction/defrag corrupted the database, restore from the most recent snapshot.",
             cmds=["ETCDCTL_API=3 etcdctl snapshot restore /path/to/snapshot.db --data-dir=/var/lib/etcd-restore",
                   "# Replace /var/lib/etcd with restored data",
                   "systemctl restart etcd"]),
        dict(title="Revert Quota Change",
             desc="If the quota increase causes instability, revert to the default 2GB.",
             cmds=["vi /etc/kubernetes/manifests/etcd.yaml",
                   "# Set --quota-backend-bytes=2147483648"]),
    ],
    dependencies=[
        ["Step 1: Confirm Alarm State", "—", "—"],
        ["Step 2: Check Disk Usage", "Step 1", "—"],
        ["Step 3: Compact Revision History", "Step 1, Step 2", "—"],
        ["Step 4: Defragment etcd", "Step 3", "—"],
        ["Step 5: Disarm NOSPACE Alarm", "Step 4", "—"],
        ["Step 6: Increase Quota Limit", "Step 5", "—"],
    ]
),

# ── 8. HPA Not Scaling ────────────────────────────────────────────────────────
dict(
    filename="k8s-hpa-not-scaling.pdf",
    title="Kubernetes HorizontalPodAutoscaler Not Scaling Runbook",
    doc_id="RB-K8S-009", category="kubernetes", severity="P2 - High",
    domain="Container Orchestration", duration="20-35 minutes",
    tags="kubernetes, hpa, autoscaler, metrics-server, cpu, scaling",
    overview=(
        "A HorizontalPodAutoscaler that is not scaling may leave the application under-provisioned during traffic spikes. "
        "Common causes: metrics-server not running, missing resource requests on pods, wrong metric type, "
        "or cooldown/stabilization window preventing scale-out."
    ),
    prereqs=[
        "kubectl configured for the cluster",
        "Access to metrics-server pod logs",
        "Understanding of the expected traffic pattern",
    ],
    steps=[
        dict(title="Check HPA Status",
             desc="Describe the HPA to see current metrics values, desired replicas, and any error conditions.",
             cmds=["kubectl get hpa -n <namespace>",
                   "kubectl describe hpa <hpa-name> -n <namespace>"],
             note="Look for 'unknown' in the TARGETS column — this means HPA cannot read metrics."),
        dict(title="Verify Metrics Server is Running",
             desc="The HPA requires metrics-server to be running in kube-system to read CPU/memory metrics.",
             cmds=["kubectl get pods -n kube-system | grep metrics-server",
                   "kubectl top pods -n <namespace>",
                   "kubectl top nodes"],
             note="If kubectl top fails, metrics-server is not running or has certificate issues."),
        dict(title="Check Resource Requests are Set",
             desc="HPA CPU percentage targets are calculated relative to the pod's CPU request. If requests are not set, HPA cannot calculate utilization.",
             cmds=["kubectl get deployment <deployment-name> -n <namespace> -o jsonpath='{.spec.template.spec.containers[*].resources}'",
                   "kubectl describe hpa <hpa-name> -n <namespace> | grep -i 'resource'"],
             note="CRITICAL: Set CPU requests on all containers. Without requests, HPA shows unknown/0% utilization."),
        dict(title="Check HPA Min/Max Replicas",
             desc="Verify the HPA min and max replica bounds are not preventing scaling.",
             cmds=["kubectl get hpa <hpa-name> -n <namespace> -o jsonpath='{.spec}'",
                   "kubectl get deployment <deployment-name> -n <namespace> -o jsonpath='{.spec.replicas}'"],
             note=None),
        dict(title="Check Stabilization Window",
             desc="The default HPA stabilization window is 5 minutes for scale-down, 0 for scale-up. Check if scale-up is blocked by the window.",
             cmds=["kubectl get hpa <hpa-name> -n <namespace> -o yaml | grep -A10 'behavior'",
                   "kubectl describe hpa <hpa-name> -n <namespace> | grep -A5 'ScaleUp'"],
             note=None),
        dict(title="Trigger Manual Scale and Patch HPA",
             desc="If HPA is stuck, manually scale the deployment and patch the HPA to trigger a re-evaluation.",
             cmds=["kubectl scale deployment <deployment-name> --replicas=<desired> -n <namespace>",
                   "kubectl patch hpa <hpa-name> -n <namespace> -p '{\"spec\":{\"minReplicas\":<new-min>}}'",
                   "kubectl get hpa -n <namespace> -w"],
             note=None),
    ],
    rollback_steps=[
        dict(title="Disable HPA and Use Manual Replicas",
             desc="If HPA is causing instability, delete it and revert to manual replica management.",
             cmds=["kubectl delete hpa <hpa-name> -n <namespace>",
                   "kubectl scale deployment <deployment-name> --replicas=<stable-count> -n <namespace>"]),
        dict(title="Reinstall Metrics Server",
             desc="If metrics-server is broken, reinstall it via the official manifest.",
             cmds=["kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml",
                   "kubectl rollout status deployment/metrics-server -n kube-system"]),
    ],
    dependencies=[
        ["Step 1: Check HPA Status", "—", "—"],
        ["Step 2: Verify Metrics Server", "Step 1", "Step 3"],
        ["Step 3: Check Resource Requests", "Step 1", "Step 2"],
        ["Step 4: Check Min/Max Replicas", "Step 1", "Step 2, Step 3"],
        ["Step 5: Check Stabilization Window", "Step 1", "Step 2, Step 3, Step 4"],
        ["Step 6: Manual Scale + Patch", "Step 2, Step 3, Step 4, Step 5", "—"],
    ]
),

# ── 9. Kubernetes Namespace Stuck Terminating ─────────────────────────────────
dict(
    filename="k8s-namespace-stuck-terminating.pdf",
    title="Kubernetes Namespace Stuck Terminating Runbook",
    doc_id="RB-K8S-010", category="kubernetes", severity="P3 - Medium",
    domain="Container Orchestration", duration="15-25 minutes",
    tags="kubernetes, namespace, terminating, finalizers, stuck, cleanup",
    overview=(
        "A namespace stuck in Terminating state means Kubernetes has started deleting it but cannot complete "
        "because resources within it still have finalizers that are not being processed. The most common cause "
        "is a CRD (Custom Resource Definition) whose controller is no longer running."
    ),
    prereqs=[
        "kubectl with cluster-admin permissions",
        "jq installed for JSON manipulation",
        "Understanding of which CRDs/operators are installed in the cluster",
    ],
    steps=[
        dict(title="Confirm Namespace is Stuck",
             desc="Verify the namespace is in Terminating state and check how long it has been stuck.",
             cmds=["kubectl get namespaces | grep Terminating",
                   "kubectl describe namespace <namespace-name>"],
             note=None),
        dict(title="List Resources Still in Namespace",
             desc="Find all remaining resources in the namespace that are blocking deletion.",
             cmds=["kubectl api-resources --verbs=list --namespaced -o name | xargs -n1 kubectl get --show-kind --ignore-not-found -n <namespace-name> 2>/dev/null",
                   "kubectl get all -n <namespace-name>"],
             note=None),
        dict(title="Check Namespace Finalizers",
             desc="Inspect the namespace's finalizer list. The finalizers prevent deletion from completing.",
             cmds=["kubectl get namespace <namespace-name> -o json | jq '.spec.finalizers'",
                   "kubectl get namespace <namespace-name> -o jsonpath='{.spec.finalizers}'"],
             note=None),
        dict(title="Remove Resource Finalizers",
             desc="For each stuck resource, remove its finalizers so Kubernetes can delete it.",
             cmds=["kubectl patch <resource-type> <resource-name> -n <namespace-name> -p '{\"metadata\":{\"finalizers\":[]}}' --type=merge",
                   "kubectl get all -n <namespace-name>"],
             note="Only remove finalizers if the owning controller/operator is confirmed gone."),
        dict(title="Remove Namespace Finalizer via API Proxy",
             desc="If the namespace itself has a kubernetes finalizer blocking deletion, patch it out via the API proxy.",
             cmds=["kubectl proxy &",
                   "curl -H 'Content-Type: application/json' -X PUT --data-binary @- http://127.0.0.1:8001/api/v1/namespaces/<namespace-name>/finalize <<EOF\n{\"kind\":\"Namespace\",\"apiVersion\":\"v1\",\"metadata\":{\"name\":\"<namespace-name>\"},\"spec\":{\"finalizers\":[]}}\nEOF"],
             note="This is the canonical method to force-delete a stuck namespace."),
        dict(title="Verify Namespace is Deleted",
             desc="Confirm the namespace no longer appears in the cluster.",
             cmds=["kubectl get namespaces",
                   "kubectl get namespaces | grep <namespace-name> || echo 'Namespace successfully deleted'"],
             note="SUCCESS: Namespace does not appear in the list."),
    ],
    rollback_steps=[
        dict(title="Recreate Namespace if Deleted by Mistake",
             desc="If the namespace was deleted accidentally, recreate it and restore workloads.",
             cmds=["kubectl create namespace <namespace-name>",
                   "kubectl apply -f <namespace-workloads-backup>.yaml"]),
        dict(title="Reinstall CRD Controller",
             desc="If finalizers were removed because the controller was missing, reinstall the operator.",
             cmds=["helm install <operator-name> <chart> -n <operator-namespace>",
                   "kubectl get pods -n <operator-namespace>"]),
    ],
    dependencies=[
        ["Step 1: Confirm Stuck", "—", "—"],
        ["Step 2: List Resources", "Step 1", "—"],
        ["Step 3: Check Finalizers", "Step 1", "Step 2"],
        ["Step 4: Remove Resource Finalizers", "Step 2, Step 3", "—"],
        ["Step 5: Remove Namespace Finalizer", "Step 4", "—"],
        ["Step 6: Verify Deleted", "Step 5", "—"],
    ]
),

# ── 10. Kubernetes RBAC Permission Denied ────────────────────────────────────
dict(
    filename="k8s-rbac-permission-denied.pdf",
    title="Kubernetes RBAC Permission Denied Runbook",
    doc_id="RB-K8S-011", category="kubernetes", severity="P2 - High",
    domain="Container Orchestration", duration="15-25 minutes",
    tags="kubernetes, rbac, permission, serviceaccount, clusterrole, rolebinding, unauthorized",
    overview=(
        "RBAC Permission Denied errors (403 Forbidden) mean a ServiceAccount, user, or group is attempting "
        "an action not permitted by the current Role or ClusterRole bindings. This affects pod-to-API-server "
        "communication (operators, controllers, CI/CD pipelines) and kubectl access for human users."
    ),
    prereqs=[
        "kubectl with cluster-admin permissions for RBAC diagnosis",
        "Knowledge of which ServiceAccount the affected pod uses",
        "Access to application logs showing the 403 error",
    ],
    steps=[
        dict(title="Identify the Denied Action",
             desc="Collect the exact RBAC error from pod logs or kubectl output, including the verb, resource, and namespace.",
             cmds=["kubectl logs <pod-name> -n <namespace> | grep -i 'forbidden\\|403\\|permission denied'",
                   "kubectl auth can-i <verb> <resource> -n <namespace> --as=system:serviceaccount:<namespace>:<serviceaccount>"],
             note="The auth can-i command simulates what a ServiceAccount is allowed to do."),
        dict(title="Check ServiceAccount Used by Pod",
             desc="Identify the ServiceAccount name bound to the affected pod.",
             cmds=["kubectl get pod <pod-name> -n <namespace> -o jsonpath='{.spec.serviceAccountName}'",
                   "kubectl get serviceaccount -n <namespace>"],
             note=None),
        dict(title="Check Existing RoleBindings",
             desc="List all RoleBindings and ClusterRoleBindings for the ServiceAccount.",
             cmds=["kubectl get rolebindings -n <namespace> -o wide",
                   "kubectl get clusterrolebindings -o wide | grep <serviceaccount>",
                   "kubectl describe rolebinding <binding-name> -n <namespace>"],
             note=None),
        dict(title="Inspect the Role/ClusterRole",
             desc="Examine the rules in the Role or ClusterRole to understand what is and is not permitted.",
             cmds=["kubectl describe role <role-name> -n <namespace>",
                   "kubectl describe clusterrole <clusterrole-name>"],
             note=None),
        dict(title="Create or Update RoleBinding",
             desc="Grant the missing permission by creating a new RoleBinding or patching the existing Role.",
             cmds=["# Option A: bind to existing ClusterRole",
                   "kubectl create rolebinding <name> --clusterrole=<role> --serviceaccount=<namespace>:<sa> -n <namespace>",
                   "# Option B: create custom Role with specific verbs",
                   "kubectl create role <role-name> --verb=get,list,watch --resource=pods -n <namespace>",
                   "kubectl create rolebinding <binding-name> --role=<role-name> --serviceaccount=<namespace>:<sa> -n <namespace>"],
             note="Follow least-privilege: grant only the exact verbs and resources needed, not wildcards."),
        dict(title="Verify Permission Granted",
             desc="Re-run the auth can-i check and verify the pod now has the required access.",
             cmds=["kubectl auth can-i <verb> <resource> -n <namespace> --as=system:serviceaccount:<namespace>:<serviceaccount>",
                   "kubectl rollout restart deployment/<deployment-name> -n <namespace>",
                   "kubectl logs <new-pod-name> -n <namespace> | grep -i 'forbidden\\|403' || echo 'No RBAC errors'"],
             note="SUCCESS: auth can-i returns 'yes' and pod logs show no more 403 errors."),
    ],
    rollback_steps=[
        dict(title="Remove Over-Permissive Binding",
             desc="If a binding was granted too broadly, delete it and create a narrower one.",
             cmds=["kubectl delete rolebinding <binding-name> -n <namespace>",
                   "kubectl create role <narrow-role> --verb=get,list --resource=pods -n <namespace>"]),
        dict(title="Audit All RoleBindings",
             desc="After any RBAC change, audit all bindings in the namespace.",
             cmds=["kubectl get rolebindings,clusterrolebindings -A -o wide | grep <serviceaccount>",
                   "kubectl auth can-i --list --as=system:serviceaccount:<namespace>:<sa> -n <namespace>"]),
    ],
    dependencies=[
        ["Step 1: Identify Denied Action", "—", "—"],
        ["Step 2: Check ServiceAccount", "Step 1", "—"],
        ["Step 3: Check RoleBindings", "Step 2", "—"],
        ["Step 4: Inspect Role/ClusterRole", "Step 3", "—"],
        ["Step 5: Create/Update RoleBinding", "Step 3, Step 4", "—"],
        ["Step 6: Verify Permission", "Step 5", "—"],
    ]
),

]  # end RUNBOOKS


if __name__ == "__main__":
    import os
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print(f"Generating {len(RUNBOOKS)} Kubernetes runbook PDFs...")
    for rb in RUNBOOKS:
        build_doc(**rb)
    print(f"\nDone. {len(RUNBOOKS)} PDFs written.")
