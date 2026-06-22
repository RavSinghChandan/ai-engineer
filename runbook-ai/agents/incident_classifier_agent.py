"""
RAGless incident classifier.
Extracts structured fields from a free-text incident description.
No embeddings — LLM produces JSON, we query SQL with exact fields.
"""
import json
import logging
import re
from utils.llm import call_llm

logger = logging.getLogger(__name__)


def _strip_fences(text: str) -> str:
    text = text.strip()
    m = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    return m.group(1).strip() if m else text

SYSTEM = """You are a Kubernetes incident classifier. Given a free-text incident description,
extract structured fields to help find the right Kubernetes runbook.

Respond with JSON only:
{
  "keywords": ["list", "of", "key", "technical", "terms"],
  "category": one of [kubernetes, networking, database, security, storage, cicd, monitoring, other],
  "severity": one of [P1, P2, P3, P4],
  "symptoms": ["observable symptoms described"],
  "affected_component": "the system/service affected",
  "search_terms": ["2-4 short search terms to find the right runbook"]
}

IMPORTANT: If the incident mentions ANY Kubernetes concepts (pods, nodes, namespaces, kubectl,
etcd, PVC, PersistentVolume, Ingress, RBAC, CrashLoopBackOff, OOMKilled, Deployment, HPA,
certificates, cluster, kubelet, control plane, API server), set category="kubernetes".

Severity guidelines:
- P1: System completely down, data loss, security breach in progress, cluster unreachable
- P2: Major feature unavailable, many users affected, pods not starting
- P3: Minor feature broken, workaround exists
- P4: Cosmetic, low impact"""


_K8S_SIGNALS = {
    "pod", "pods", "node", "nodes", "namespace", "kubectl", "etcd", "pvc",
    "persistentvolume", "persistentvolumeclaim", "ingress", "rbac", "crashloopbackoff",
    "oomkilled", "deployment", "hpa", "horizontalpodautoscaler", "certificate",
    "cluster", "kubelet", "kubeconfig", "control plane", "api server", "apiserver",
    "clusterrole", "clusterrolebinding", "evicted", "eviction", "scheduler",
    "daemonset", "statefulset", "replicaset", "configmap", "secret", "service account",
}


def _force_k8s_category(text: str, category: str) -> str:
    """Override to 'kubernetes' if the text contains Kubernetes-specific signals."""
    lowered = text.lower()
    if any(signal in lowered for signal in _K8S_SIGNALS):
        return "kubernetes"
    return category


def classify_incident(incident_text: str) -> dict:
    """Extract structured fields from incident description."""
    try:
        response = call_llm(SYSTEM, f"Incident: {incident_text}", max_tokens=512)
        parsed = json.loads(_strip_fences(response))
        raw_category = parsed.get("category", "other")
        category = _force_k8s_category(incident_text, raw_category)
        return {
            "keywords": parsed.get("keywords", []),
            "category": category,
            "severity": parsed.get("severity", "P3"),
            "symptoms": parsed.get("symptoms", []),
            "affected_component": parsed.get("affected_component", ""),
            "search_terms": parsed.get("search_terms", []),
        }
    except Exception as exc:
        # BUG FIX: (json.JSONDecodeError, Exception) is redundant — JSONDecodeError is a subclass
        # of Exception, so the first clause was dead code. Catching bare Exception also silently
        # swallowed LLM auth errors, timeouts, etc. Log the actual error so operators can see it.
        logger.warning("classify_incident fallback: %s", exc)
        words = [w.strip(".,;:!?") for w in incident_text.lower().split() if len(w) > 3]
        return {
            "keywords": words[:5],
            "category": "other",
            "severity": "P3",
            "symptoms": [incident_text],
            "affected_component": "",
            "search_terms": words[:3],
        }
