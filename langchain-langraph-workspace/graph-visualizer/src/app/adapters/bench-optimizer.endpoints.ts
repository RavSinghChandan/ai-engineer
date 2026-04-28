import { ExecutionStep, EndpointDef as EndpointConfig, FormField as EndpointField } from '../models/visualizer.models';

// ── Step helpers ─────────────────────────────────────────────────────────────

function userStep(id: number, desc: string, code: string, out: Record<number,string>): ExecutionStep {
  return { id, name: 'User Request', description: desc, file: 'frontend/app.component.ts', functionName: 'submit()', nodeId: 'user', badge: 'Angular', highlightLine: 1, status: 'pending', code, lineOutputs: out };
}
function routeStep(id: number, method: string, path: string, fn: string, desc: string, code: string, out: Record<number,string>): ExecutionStep {
  return { id, name: `${method} ${path}`, description: desc, file: 'backend/main.py', functionName: fn, nodeId: 'routes', badge: 'FastAPI', highlightLine: 1, status: 'pending', code, lineOutputs: out };
}
function llmStep(id: number, agent: string, desc: string, code: string, out: Record<number,string>): ExecutionStep {
  return { id, name: `DeepSeek: ${agent}`, description: desc, file: `agents/${agent}.py`, functionName: agent + '()', nodeId: 'llm', badge: 'DeepSeek LLM', highlightLine: 1, status: 'pending', code, lineOutputs: out };
}
function cvStep(id: number, desc: string, code: string, out: Record<number,string>): ExecutionStep {
  return { id, name: 'CV Parser Agent', description: desc, file: 'agents/cv_parser_agent.py', functionName: 'parse_cv()', nodeId: 'cv-agent', badge: 'LangChain Agent', highlightLine: 1, status: 'pending', code, lineOutputs: out };
}
function ragStep(id: number, desc: string, code: string, out: Record<number,string>): ExecutionStep {
  return { id, name: 'RAG / Role Knowledge', description: desc, file: 'rag/knowledge_base.py', functionName: 'get_all_roles()', nodeId: 'rag', badge: 'FAISS + HuggingFace', highlightLine: 1, status: 'pending', code, lineOutputs: out };
}
function planStep(id: number, name: string, desc: string, fn: string, code: string, out: Record<number,string>): ExecutionStep {
  return { id, name, description: desc, file: 'agents/planning_agent.py', functionName: fn, nodeId: 'plan', badge: 'Async Planner', highlightLine: 1, status: 'pending', code, lineOutputs: out };
}
function storageStep(id: number, op: string, desc: string, code: string, out: Record<number,string>): ExecutionStep {
  return { id, name: `Storage: ${op}`, description: desc, file: 'storage.py', functionName: op, nodeId: 'storage', badge: 'JSON Storage', highlightLine: 1, status: 'pending', code, lineOutputs: out };
}
function doneStep(id: number, model: string, desc: string, fields: string): ExecutionStep {
  return {
    id, name: 'Response Serialised', description: desc,
    file: 'backend/main.py', functionName: 'return',
    nodeId: 'response', badge: 'FastAPI', highlightLine: 1, status: 'pending',
    code: `class ${model}(BaseModel):\n${fields}`,
    lineOutputs: { 1: `class ${model}(BaseModel)`, 2: 'Fields serialised to JSON' },
  };
}

// ── Shared code snippets ─────────────────────────────────────────────────────

const LLM_INIT_CODE = `# LLM initialised once at startup via lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _llm, _vector_store
    _llm = ChatOpenAI(
        model="deepseek-chat",
        openai_api_key=os.getenv("DEEPSEEK_API_KEY"),
        openai_api_base="https://api.deepseek.com",
        temperature=0,    # deterministic — consistent output, marginally faster
    )
    embeddings = get_embeddings()           # HuggingFace all-MiniLM-L6-v2
    _vector_store = build_vector_store(embeddings)  # FAISS from roles YAML
    yield   # app runs here

app = FastAPI(lifespan=lifespan)`;

const RAG_CODE = `# rag/knowledge_base.py — roles loaded from YAML, indexed with FAISS
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
import yaml

def get_embeddings():
    return HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

def build_vector_store(embeddings) -> FAISS:
    roles = load_roles()   # from roles.yaml
    docs  = [role_to_doc(r) for r in roles]
    return FAISS.from_documents(docs, embeddings)

def get_all_roles() -> list:
    return load_roles()    # returns list of {id, title, description, skills}

# FAISS used for role similarity search in map_role:
# _vector_store.similarity_search(target_role, k=3)`;

const CV_PARSER_CODE = `SYSTEM_PROMPT = "You are a CV parser. Return ONLY valid JSON, no markdown."

USER_PROMPT = """Extract info from this resume. Return ONLY this JSON:
{
  "name": "<full name>",
  "email": "<email>",
  "skills": [<technical skill strings>],
  "experience_years": <int>,
  "roles": [<job title strings>],
  "projects": [{"name": ..., "technologies": [...]}],
  "education": "<degree and field>"
}
Resume: {resume_text}"""

def parse_cv(resume_text: str, llm: ChatOpenAI) -> dict:
    trimmed = resume_text[:1200]  # first 1200 chars capture key info
    prompt  = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human",  USER_PROMPT.format(resume_text=trimmed)),
    ])
    chain  = prompt | llm | StrOutputParser()
    result = chain.invoke({})
    return parse_llm_json(result)   # safe JSON parser`;

const ROLE_MAP_CODE = `SYSTEM_PROMPT = "You are a technical recruiter. Return ONLY compact JSON."

USER_PROMPT = """Compare candidate vs role. Return ONLY this JSON:
{
  "role": "{role_title}",
  "match_percentage": <0-100>,
  "matched_skills": [<skills candidate has>],
  "missing_skills": [<required skills candidate lacks>],
  "experience_gap": <int years>,
  "recommendation": "<max 12 words>"
}
Candidate skills: {candidate_skills}
Role requirements: {role_context}"""

def map_role(parsed_cv, target_role, vector_store, llm):
    # Step 1: FAISS similarity search for role requirements
    docs = vector_store.similarity_search(target_role, k=3)
    role_context = "\\n".join(d.page_content for d in docs)
    # Step 2: DeepSeek LLM call
    chain  = prompt | llm | StrOutputParser()
    result = chain.invoke({
        "role_title":        target_role,
        "candidate_skills":  parsed_cv["skills"],
        "role_context":      role_context,
    })
    return parse_llm_json(result)`;

const PLANNING_CODE = `# Two-phase async planning — fast & accurate
async def generate_plan(target_role, missing_skills, current_skills, llm, num_days):
    # Phase 1 (1 LLM call): get N day themes as pipe-delimited text
    themes_raw = await _get_themes(target_role, missing_skills, num_days, llm)
    themes = [t.strip() for t in themes_raw.split("|")]

    # Phase 2 (N parallel LLM calls): generate 2 tasks per day
    tasks = await asyncio.gather(*[
        _get_day_tasks(target_role, themes[i], missing_skills, llm, i + 1)
        for i in range(len(themes))
    ])
    # Inject static resource links (no LLM — avoids hallucinated URLs)
    for day_tasks in tasks:
        for task in day_tasks:
            task["resource"] = SKILL_RESOURCES.get(task["skill"].lower(), "#")
    return {"days": [{"theme": t, "tasks": ts} for t, ts in zip(themes, tasks)]}`;

const TRACKING_CODE = `def calculate_readiness(role, plan, completed_task_ids):
    total_tasks = sum(len(day["tasks"]) for day in plan.get("days", []))
    completed   = len(completed_task_ids)
    percentage  = round((completed / total_tasks * 100), 1) if total_tasks else 0

    # Skill readiness map — which skills are covered by completed tasks
    skill_map: dict = {}
    for day in plan.get("days", []):
        for task in day["tasks"]:
            skill = task.get("skill", "general")
            done  = task["id"] in completed_task_ids
            skill_map[skill] = skill_map.get(skill, False) or done

    ready_skills   = [s for s, done in skill_map.items() if done]
    pending_skills = [s for s, done in skill_map.items() if not done]

    return {
        "readiness_percentage": percentage,
        "completed_tasks":      completed,
        "total_tasks":          total_tasks,
        "ready_skills":         ready_skills,
        "pending_skills":       pending_skills,
    }`;

// ── HEALTH endpoint ───────────────────────────────────────────────────────────

function buildHealthSteps(): ExecutionStep[] {
  return [
    userStep(0, 'Health check — confirms DeepSeek LLM and FAISS vector store are ready.',
      `fetch('/health').then(r => r.json()).then(d => {
  console.log(d.status);  // "ok"
  console.log(d.llm);     // "deepseek-chat"
});`,
      { 1: 'GET /health', 2: 'status: "ok"', 3: 'llm: "deepseek-chat"' }),

    routeStep(1, 'GET', '/health', 'health()',
      'Returns service status and active LLM model name.',
      `@app.get("/health")
def health():
    return {"status": "ok", "llm": "deepseek-chat"}`,
      { 1: 'GET /health mounted', 2: '▶ health() invoked', 3: 'return {"status": "ok", "llm": "deepseek-chat"}' }),

    llmStep(2, 'no LLM call', 'Health check reads config only — DeepSeek not invoked.',
      LLM_INIT_CODE,
      { 1: '# LLM initialised at startup via lifespan', 5: '_llm = ChatOpenAI(model="deepseek-chat")', 9: 'temperature=0 — deterministic', 11: '_vector_store = FAISS from roles YAML' }),

    cvStep(3, 'CV parser not invoked for health check.', `# parse_cv() not called for GET /health`, { 1: '# Not invoked' }),
    ragStep(4, 'Vector store not queried for health check.', `# FAISS not queried for GET /health\n# _vector_store exists but is not called`, { 1: '# Not queried' }),
    planStep(5, 'no op', 'Planning agent not invoked.', 'no op', `# generate_plan() not called`, { 1: '# Not invoked' }),
    storageStep(6, 'no op', 'Storage not accessed for health check.', `# storage.py not accessed for GET /health`, { 1: '# Not accessed' }),
    doneStep(7, 'HealthResponse', 'Simple status response.',
      `    status: str  # "ok"\n    llm: str     # "deepseek-chat"`),
  ];
}

// ── ROLES endpoint ────────────────────────────────────────────────────────────

function buildRolesSteps(): ExecutionStep[] {
  return [
    userStep(0, 'UI requests all available roles to populate the role selector dropdown.',
      `fetch('/roles').then(r => r.json()).then(roles => {
  roles.forEach(r => console.log(r.id, r.title, r.description));
  // UI populates role dropdown
});`,
      { 1: 'GET /roles', 2: 'Array of {id, title, description}' }),

    routeStep(1, 'GET', '/roles', 'list_roles()',
      'Reads all roles from the YAML knowledge base and returns id, title, description.',
      `@app.get("/roles")
def list_roles():
    roles = get_all_roles()
    return [
        {"id": r["id"], "title": r["title"], "description": r["description"]}
        for r in roles
    ]`,
      { 1: 'GET /roles mounted', 2: '▶ list_roles() invoked', 3: 'get_all_roles() — read from YAML', 4: 'return id, title, description per role' }),

    llmStep(2, 'no LLM call', 'Roles read from YAML — no DeepSeek call for GET /roles.',
      `# GET /roles reads from static YAML — no LLM call
# LLM is only used in: parse_cv, map_role, generate_plan

# roles.yaml structure:
# - id: java-backend-developer
#   title: Java Backend Developer
#   description: Build enterprise APIs with Java/Spring
#   skills: [java, spring-boot, microservices, docker, jwt]`,
      { 1: '# No LLM call for GET /roles', 3: '# LLM used only in cv/map/plan endpoints' }),

    cvStep(3, 'CV agent not invoked.', `# parse_cv() not called for GET /roles`, { 1: '# Not invoked' }),

    ragStep(4, 'get_all_roles() reads the YAML knowledge base — the same source used to build the FAISS vector store.',
      RAG_CODE,
      { 1: '# rag/knowledge_base.py', 4: 'get_embeddings() — HuggingFace all-MiniLM-L6-v2', 7: 'FAISS.from_documents(docs, embeddings)', 10: '▶ get_all_roles() — reads roles.yaml', 12: '# FAISS used for similarity_search in map_role' }),

    planStep(5, 'no op', 'Planning agent not invoked.', 'no op', `# generate_plan() not called for GET /roles`, { 1: '# Not invoked' }),
    storageStep(6, 'no op', 'Storage not accessed.', `# storage.py not accessed for GET /roles`, { 1: '# Not accessed' }),
    doneStep(7, 'RolesResponse', 'Array of all available roles with id, title, description.',
      `    # list of:\n    id: str           # "java-backend-developer"\n    title: str        # "Java Backend Developer"\n    description: str  # "Build enterprise APIs..."`),
  ];
}

// ── UPLOAD CV endpoint ────────────────────────────────────────────────────────

function buildUploadCVSteps(): ExecutionStep[] {
  return [
    userStep(0, 'User uploads their resume PDF. Angular sends multipart/form-data to /upload-cv.',
      `const formData = new FormData();
formData.append('file', pdfFile);   // .pdf only

fetch('/upload-cv', { method: 'POST', body: formData })
  .then(r => r.json())
  .then(data => {
    console.log('user_id:', data.user_id);       // UUID for this session
    console.log('skills:', data.profile.skills); // ["Java", "Spring Boot", ...]
  });`,
      { 1: 'FormData with PDF attachment', 3: 'POST /upload-cv — multipart', 6: 'user_id: session UUID', 7: 'profile.skills extracted by DeepSeek' }),

    routeStep(1, 'POST', '/upload-cv', 'upload_cv()',
      'Reads PDF bytes, extracts text, calls parse_cv() with DeepSeek, saves user profile, returns user_id.',
      `@app.post("/upload-cv")
async def upload_cv(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted.")
    raw_bytes   = await file.read()
    resume_text = extract_text_from_pdf(raw_bytes)   # pdfminer
    if not resume_text:
        raise HTTPException(422, "Could not extract text from PDF.")
    parsed  = parse_cv(resume_text, _llm)   # DeepSeek LLM call
    user_id = save_user({"profile": parsed, "resume_text": resume_text[:500]})
    return {"user_id": user_id, "profile": parsed}`,
      { 1: 'POST /upload-cv — multipart', 2: '▶ upload_cv() invoked', 5: 'file.read() — PDF bytes', 6: 'extract_text_from_pdf() — pdfminer', 9: '▶ parse_cv(resume_text, _llm) — DeepSeek call', 10: 'save_user() — JSON storage' }),

    llmStep(2, 'parse_cv',
      'DeepSeek-chat called with trimmed resume (1200 chars). Returns structured JSON: name, skills, roles, experience_years, projects.',
      CV_PARSER_CODE,
      { 1: 'SYSTEM_PROMPT: "CV parser — return JSON"', 12: '▶ parse_cv(resume_text, llm)', 13: 'trimmed = resume_text[:1200]', 15: 'ChatPromptTemplate: system + human', 18: 'chain = prompt | llm | StrOutputParser()', 19: 'chain.invoke() → DeepSeek API call', 20: 'parse_llm_json(result) — safe JSON parse' }),

    cvStep(3, 'parse_cv() runs the CV parsing chain. Extracts structured data from unstructured PDF text via DeepSeek.',
      CV_PARSER_CODE,
      { 12: '▶ parse_cv(resume_text, llm)', 13: 'resume trimmed to 1200 chars', 15: 'prompt assembled', 19: 'DeepSeek API called', 20: 'JSON parsed: name, email, skills, experience_years, roles' }),

    ragStep(4, 'FAISS vector store not queried for CV parsing — only used in /map-role.',
      `# FAISS not used in /upload-cv
# CV parsing = unstructured text → structured JSON
# No similarity search needed

# FAISS is used in /map-role:
# _vector_store.similarity_search(target_role, k=3)
# → retrieves role requirements for comparison`,
      { 1: '# FAISS not queried in /upload-cv', 5: '# FAISS used in /map-role for role requirements' }),

    planStep(5, 'no op', 'Planning agent not invoked for CV upload.', 'no op', `# generate_plan() not called for /upload-cv`, { 1: '# Not invoked' }),

    storageStep(6, 'save_user()',
      'Parsed CV profile saved to JSON file keyed by UUID. Used in all subsequent endpoints.',
      `def save_user(data: dict) -> str:
    user_id = str(uuid.uuid4())
    path    = USERS_DIR / f"{user_id}.json"
    path.write_text(json.dumps(data, indent=2))
    return user_id

def get_user(user_id: str) -> dict | None:
    path = USERS_DIR / f"{user_id}.json"
    return json.loads(path.read_text()) if path.exists() else None

# USERS_DIR = data/users/
# Each user → one .json file named by UUID`,
      { 1: '▶ save_user({"profile": parsed, ...})', 2: 'user_id = uuid4()', 3: 'path = data/users/{user_id}.json', 4: 'JSON written to disk', 5: 'user_id returned → sent to frontend' }),

    doneStep(7, 'UploadCVResponse', 'Returns user_id UUID and parsed profile for the session.',
      `    user_id: str    # UUID for this user session\n    profile: dict  # {name, email, skills, experience_years, roles, projects}`),
  ];
}

// ── MAP ROLE endpoint ─────────────────────────────────────────────────────────

function buildMapRoleSteps(form: Record<string,any>): ExecutionStep[] {
  const role = form['target_role'] || 'Java Backend Developer';

  return [
    userStep(0, `User selects target role "${role}" and submits — /map-role compares their CV against role requirements.`,
      `fetch('/map-role', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    user_id: sessionUserId,
    target_role: "${role}",
  }),
})
.then(r => r.json())
.then(data => {
  console.log('match:', data.match_percentage, '%');
  console.log('missing:', data.missing_skills);
});`,
      { 3: `user_id: sessionUserId`, 4: `target_role: "${role}"`, 10: 'match_percentage: 72', 11: 'missing_skills: ["Docker", "Kubernetes"]' }),

    routeStep(1, 'POST', '/map-role', 'map_role_endpoint()',
      'Loads user profile from storage, calls map_role() with DeepSeek + FAISS to compare skills vs role requirements.',
      `@app.post("/map-role")
def map_role_endpoint(req: MapRoleRequest):
    user = get_user(req.user_id)
    if not user:
        raise HTTPException(404, "User not found.")
    return map_role(user["profile"], req.target_role, _vector_store, _llm)`,
      { 1: 'POST /map-role mounted', 2: '▶ map_role_endpoint() invoked', 3: 'get_user(user_id) — load profile from JSON', 5: '▶ map_role(profile, target_role, vector_store, llm)' }),

    llmStep(2, 'map_role',
      `DeepSeek-chat compares candidate skills vs FAISS-retrieved role requirements for "${role}". Returns match %, missing skills, recommendation.`,
      ROLE_MAP_CODE,
      { 1: 'SYSTEM_PROMPT: "technical recruiter — return JSON"', 14: '▶ map_role(parsed_cv, target_role, vector_store, llm)', 15: `similarity_search("${role}", k=3) → role requirements`, 17: 'role_context assembled from FAISS docs', 18: 'prompt | llm | StrOutputParser chain', 19: 'chain.invoke() → DeepSeek API call' }),

    cvStep(3, 'User profile loaded from storage — parse_cv() was already called on /upload-cv.',
      `# parse_cv() already ran on /upload-cv
# /map-role loads the saved profile:
user = get_user(req.user_id)
profile = user["profile"]
# profile = {
#   "name": "Chandan Kumar",
#   "skills": ["Java", "Spring Boot", "Angular"],
#   "experience_years": 5,
#   "roles": ["Software Engineer", "Full Stack Developer"],
# }`,
      { 3: 'get_user(user_id) — load saved profile', 4: 'profile = parsed CV from /upload-cv', 6: 'name, skills, experience loaded' }),

    ragStep(4, `FAISS similarity_search("${role}", k=3) retrieves role requirements — compared against candidate skills by DeepSeek.`,
      RAG_CODE,
      { 1: '# role_mapping_agent.py', 14: `▶ _vector_store.similarity_search("${role}", k=3)`, 15: 'top 3 most similar role docs retrieved', 16: 'role_context = required skills + description', 17: 'injected into DeepSeek prompt' }),

    planStep(5, 'no op', 'Planning agent not invoked for map-role.', 'no op', `# generate_plan() not called for /map-role`, { 1: '# Not invoked — plan comes from /generate-plan' }),
    storageStep(6, 'get_user()', 'User profile loaded from JSON storage.',
      `user = get_user(req.user_id)
# Reads data/users/{user_id}.json
# Returns profile with skills, experience_years, roles`,
      { 1: '▶ get_user(user_id)', 2: 'data/users/{user_id}.json read', 3: 'profile returned' }),
    doneStep(7, 'MapRoleResponse', 'Role comparison result with match percentage and missing skills.',
      `    role: str                  # "${role}"\n    match_percentage: int      # 0-100\n    matched_skills: list[str]  # skills candidate has\n    missing_skills: list[str]  # skills to acquire\n    experience_gap: int        # years needed\n    recommendation: str        # max 12 words`),
  ];
}

// ── GENERATE PLAN endpoint ────────────────────────────────────────────────────

function buildGeneratePlanSteps(form: Record<string,any>): ExecutionStep[] {
  const role = form['target_role'] || 'Java Backend Developer';
  const days = form['num_days'] || 7;

  return [
    userStep(0, `User requests a ${days}-day upskilling plan for "${role}". Angular sends missing skills list.`,
      `fetch('/generate-plan', {
  method: 'POST',
  body: JSON.stringify({
    user_id:        sessionUserId,
    target_role:    "${role}",
    missing_skills: ["Docker", "Kubernetes", "JWT"],
    num_days:       ${days},
  }),
});`,
      { 3: 'user_id: sessionUserId', 4: `target_role: "${role}"`, 5: 'missing_skills: from /map-role result', 6: `num_days: ${days}` }),

    routeStep(1, 'POST', '/generate-plan', 'generate_plan_endpoint()',
      `Loads user profile, calls async generate_plan() with ${days} parallel DeepSeek calls, saves plan to storage.`,
      `@app.post("/generate-plan")
async def generate_plan_endpoint(req: GeneratePlanRequest):
    user = get_user(req.user_id)
    if not user:
        raise HTTPException(404, "User not found.")
    current_skills = user["profile"].get("skills", [])
    plan = await generate_plan(
        req.target_role, req.missing_skills, current_skills,
        _llm, req.num_days
    )
    save_progress(req.user_id, {
        "role": req.target_role,
        "plan": plan,
        "completed_task_ids": [],
    })
    return plan`,
      { 1: 'POST /generate-plan — async', 2: '▶ generate_plan_endpoint() invoked', 3: 'get_user(user_id) — load profile', 6: 'current_skills extracted', 7: '▶ await generate_plan() — async DeepSeek calls', 11: 'save_progress() — persist plan' }),

    llmStep(2, 'generate_plan',
      `Phase 1: 1 DeepSeek call for ${days} day themes. Phase 2: ${days} parallel DeepSeek calls for tasks. Total: ${days + 1} LLM calls.`,
      PLANNING_CODE,
      { 1: '# Two-phase async planning', 3: `▶ Phase 1: _get_themes() → ${days} themes via 1 LLM call`, 5: 'themes split by pipe delimiter', 7: `▶ Phase 2: asyncio.gather() → ${days} parallel LLM calls`, 8: '_get_day_tasks() × num_days — 2 tasks per day', 11: 'SKILL_RESOURCES injected (no LLM — no URL hallucination)', 13: 'plan assembled and returned' }),

    cvStep(3, 'User profile loaded — skills used to contextualise the plan.',
      `# current_skills from user profile injected into planner
user = get_user(req.user_id)
current_skills = user["profile"].get("skills", [])
# Injected into generate_plan() — DeepSeek knows
# what the candidate already knows, avoids redundant tasks`,
      { 2: 'get_user(user_id) — load profile', 3: 'current_skills extracted', 5: 'passed to generate_plan() — avoids redundant tasks' }),

    ragStep(4, 'FAISS not used in generate-plan — role context comes from the user-provided missing_skills list.',
      `# FAISS not queried in /generate-plan
# The planner uses:
# - target_role (string from request)
# - missing_skills (from /map-role response)
# - current_skills (from parsed CV)
# FAISS is used in /map-role to get role requirements
# Planning agent uses those requirements directly`,
      { 1: '# FAISS not queried in /generate-plan', 3: '# Planner inputs:', 4: '# missing_skills from /map-role', 5: '# current_skills from parsed CV' }),

    planStep(5, 'Async Day Plan Generator', `${days}-day plan generated in 2 phases: themes first, then ${days} parallel task generations via asyncio.gather.`,
      'generate_plan()',
      PLANNING_CODE,
      { 3: `▶ Phase 1: ${days} day themes from 1 LLM call`, 5: 'pipe-split: "Docker basics|Kubernetes pods|..."', 7: `▶ Phase 2: asyncio.gather(${days} tasks) — parallel`, 9: '2 tasks per day generated by DeepSeek', 11: 'SKILL_RESOURCES: static URLs injected (no hallucination)' }),

    storageStep(6, 'save_progress()', 'Plan saved to JSON storage keyed by user_id.',
      `def save_progress(user_id: str, data: dict):
    path = PROGRESS_DIR / f"{user_id}.json"
    path.write_text(json.dumps(data, indent=2))

# Saved structure:
# {
#   "role": "Java Backend Developer",
#   "plan": {"days": [{"theme": ..., "tasks": [...]}]},
#   "completed_task_ids": [],
# }`,
      { 1: '▶ save_progress(user_id, data)', 2: 'data/progress/{user_id}.json written', 6: 'role, plan, completed_task_ids stored' }),

    doneStep(7, 'LearningPlan', `${days}-day structured upskilling plan with themes, tasks, and resource links.`,
      `    days: list[DayPlan]   # ${days} days
    # DayPlan: {theme: str, tasks: [{id, title, skill, resource}]}`),
  ];
}

// ── UPDATE PROGRESS endpoint ──────────────────────────────────────────────────

function buildProgressSteps(): ExecutionStep[] {
  return [
    userStep(0, 'User checks off completed tasks — Angular sends list of completed task IDs.',
      `fetch('/update-progress', {
  method: 'POST',
  body: JSON.stringify({
    user_id: sessionUserId,
    completed_task_ids: ["day1-task1", "day1-task2", "day2-task1"],
  }),
})
.then(r => r.json())
.then(data => {
  console.log('readiness:', data.readiness_percentage, '%');
  console.log('ready_skills:', data.ready_skills);
});`,
      { 3: 'user_id: sessionUserId', 4: 'completed_task_ids: ["day1-task1", ...]', 9: 'readiness_percentage: 42.8', 10: 'ready_skills: ["Docker"]' }),

    routeStep(1, 'POST', '/update-progress', 'update_progress()',
      'Pure Python — no LLM call. Saves completed tasks and computes readiness percentage instantly.',
      `@app.post("/update-progress")
def update_progress(req: UpdateProgressRequest):
    progress = get_progress(req.user_id)
    if not progress:
        raise HTTPException(404, "No plan found. Generate a plan first.")
    progress["completed_task_ids"] = req.completed_task_ids
    save_progress(req.user_id, progress)
    return calculate_readiness(
        progress["role"],
        progress["plan"],
        req.completed_task_ids,
    )`,
      { 1: 'POST /update-progress — sync, no LLM', 2: '▶ update_progress() invoked', 3: 'get_progress(user_id) — load plan', 6: 'completed_task_ids updated', 7: 'save_progress() — persist', 8: '▶ calculate_readiness() — pure Python' }),

    llmStep(2, 'no LLM call', 'No DeepSeek call — progress tracking is pure Python arithmetic.',
      `# No LLM call for /update-progress
# calculate_readiness() is pure Python:
# total_tasks = sum(len(day["tasks"]) for day in plan["days"])
# completed   = len(completed_task_ids)
# percentage  = (completed / total_tasks) * 100

# Design decision: no LLM for readiness tracking
# Fast, deterministic, returns instantly`,
      { 1: '# No DeepSeek call', 3: '# Pure arithmetic', 6: '# Returns instantly' }),

    cvStep(3, 'CV not re-parsed — user profile already exists from /upload-cv.', `# parse_cv() not called for /update-progress\n# Profile already saved from /upload-cv`, { 1: '# Not re-parsed' }),
    ragStep(4, 'FAISS not queried for progress update.', `# FAISS not queried for /update-progress`, { 1: '# Not queried' }),

    planStep(5, 'Readiness Calculator', 'calculate_readiness() maps completed task IDs to skills and computes coverage percentage.',
      'calculate_readiness()',
      TRACKING_CODE,
      { 1: '▶ calculate_readiness(role, plan, completed_ids)', 2: 'total_tasks = sum of all tasks across days', 3: 'completed = len(completed_task_ids)', 4: 'percentage = completed / total * 100', 7: 'skill_map: skill → done bool', 14: 'ready_skills: skills fully covered', 15: 'pending_skills: skills still needed' }),

    storageStep(6, 'save_progress() + get_progress()', 'Progress loaded, updated with new completed IDs, and saved back.',
      `# Load → update → save pattern
progress = get_progress(req.user_id)          # read
progress["completed_task_ids"] = req.completed_task_ids  # update
save_progress(req.user_id, progress)          # write back

def get_progress(user_id: str) -> dict | None:
    path = PROGRESS_DIR / f"{user_id}.json"
    return json.loads(path.read_text()) if path.exists() else None`,
      { 1: '# Load → update → save', 2: 'get_progress(user_id) — load JSON', 3: 'completed_task_ids updated', 4: 'save_progress() — write back' }),

    doneStep(7, 'ReadinessResponse', 'Readiness percentage with skill coverage breakdown.',
      `    readiness_percentage: float   # 0-100\n    completed_tasks: int\n    total_tasks: int\n    ready_skills: list[str]\n    pending_skills: list[str]`),
  ];
}

// ── GET PROGRESS endpoint ─────────────────────────────────────────────────────

function buildGetProgressSteps(): ExecutionStep[] {
  return [
    userStep(0, 'User refreshes — GET /progress/{user_id} restores their plan and completed tasks.',
      `const userId = sessionStorage.getItem('user_id');
fetch(\`/progress/\${userId}\`)
  .then(r => r.json())
  .then(data => {
    console.log('role:', data.role);
    console.log('completed:', data.completed_task_ids.length);
  });`,
      { 1: 'user_id from session', 2: 'GET /progress/{user_id}', 5: 'role: "Java Backend Developer"', 6: 'completed_task_ids restored' }),

    routeStep(1, 'GET', '/progress/{user_id}', 'get_progress_endpoint()',
      'Reads the progress JSON file for the given user_id and returns plan + completed tasks.',
      `@app.get("/progress/{user_id}")
def get_progress_endpoint(user_id: str):
    progress = get_progress(user_id)
    if not progress:
        raise HTTPException(404, "No progress found.")
    return progress`,
      { 1: 'GET /progress/{user_id}', 2: '▶ get_progress_endpoint() invoked', 3: 'get_progress(user_id) — read JSON file', 5: 'return full progress object' }),

    llmStep(2, 'no LLM call', 'Pure storage read — no DeepSeek call.', `# No DeepSeek call for GET /progress\n# Pure file system read`, { 1: '# No LLM call' }),
    cvStep(3, 'CV not accessed.', `# parse_cv() not called for GET /progress`, { 1: '# Not invoked' }),
    ragStep(4, 'FAISS not queried.', `# FAISS not queried for GET /progress`, { 1: '# Not queried' }),
    planStep(5, 'no op', 'Plan already generated — just reading from storage.', 'no op', `# generate_plan() not called\n# Plan read from storage`, { 1: '# Plan read from storage' }),

    storageStep(6, 'get_progress()', 'Reads data/progress/{user_id}.json — returns role, plan, completed_task_ids.',
      `def get_progress(user_id: str) -> dict | None:
    path = PROGRESS_DIR / f"{user_id}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())

# Returns:
# {
#   "role": "Java Backend Developer",
#   "plan": {"days": [...]},
#   "completed_task_ids": ["day1-task1", ...]
# }`,
      { 1: '▶ get_progress(user_id)', 2: 'PROGRESS_DIR / user_id.json', 4: 'json.loads() — file read', 7: 'role: target role', 8: 'plan: full day plan', 9: 'completed_task_ids: progress state' }),

    doneStep(7, 'ProgressResponse', 'Full progress state with plan and completed tasks.',
      `    role: str                      # target role\n    plan: dict                     # full day plan\n    completed_task_ids: list[str]  # completed so far`),
  ];
}

// ── Endpoint configs ──────────────────────────────────────────────────────────

export const BENCH_OPTIMIZER_ENDPOINT_CONFIGS: EndpointConfig[] = [
  {
    id: 'health',
    label: 'GET /health',
    method: 'GET',
    path: '/health',
    emoji: '💚',
    tagline: 'Service status — DeepSeek + FAISS ready',
    color: '#22c55e',
    fields: [],
    buildSteps: buildHealthSteps,
    buildBody: () => null,
  },
  {
    id: 'roles',
    label: 'GET /roles',
    method: 'GET',
    path: '/roles',
    emoji: '👔',
    tagline: 'List all available target roles',
    color: '#5e5ce6',
    fields: [],
    buildSteps: buildRolesSteps,
    buildBody: () => null,
  },
  {
    id: 'upload-cv',
    label: 'POST /upload-cv',
    method: 'POST',
    path: '/upload-cv',
    emoji: '📄',
    tagline: 'Parse PDF resume with DeepSeek LLM',
    color: '#f59e0b',
    fields: [{ name: 'resume', label: 'Resume / CV File', type: 'file', placeholder: 'PDF resume supported', accept: '.pdf,.doc,.docx' }],
    buildSteps: buildUploadCVSteps,
    buildBody: (form) => ({ filename: form['resume']?.name ?? 'resume.pdf' }),
  },
  {
    id: 'map-role',
    label: 'POST /map-role',
    method: 'POST',
    path: '/map-role',
    emoji: '🎯',
    tagline: 'FAISS + DeepSeek role gap analysis',
    color: '#8b5cf6',
    fields: [
      { name: 'user_id',     label: 'User ID (session)', type: 'text',   placeholder: 'uuid from upload-cv', default: 'demo-user-001' },
      { name: 'target_role', label: 'Target Role',       type: 'select', options: ['Java Backend Developer','React Frontend Developer','DevOps Engineer','Data Scientist','Full Stack Developer'], default: 'Java Backend Developer' },
    ],
    buildSteps: buildMapRoleSteps,
    buildBody: (form) => ({ user_id: form['user_id'] || 'demo-user-001', target_role: form['target_role'] || 'Java Backend Developer' }),
  },
  {
    id: 'generate-plan',
    label: 'POST /generate-plan',
    method: 'POST',
    path: '/generate-plan',
    emoji: '📅',
    tagline: 'Async N-day upskilling plan via DeepSeek',
    color: '#0ea5e9',
    fields: [
      { name: 'user_id',        label: 'User ID',        type: 'text',   placeholder: 'uuid',                  default: 'demo-user-001' },
      { name: 'target_role',    label: 'Target Role',    type: 'select', options: ['Java Backend Developer','React Frontend Developer','DevOps Engineer','Data Scientist','Full Stack Developer'], default: 'Java Backend Developer' },
      { name: 'num_days',       label: 'Plan Duration',  type: 'select', options: ['3','5','7','10','14'],      default: '7' },
    ],
    buildSteps: buildGeneratePlanSteps,
    buildBody: (form) => ({
      user_id:        form['user_id']     || 'demo-user-001',
      target_role:    form['target_role'] || 'Java Backend Developer',
      missing_skills: ['Docker', 'Kubernetes', 'JWT'],
      num_days:       Number(form['num_days']) || 7,
    }),
  },
  {
    id: 'update-progress',
    label: 'POST /update-progress',
    method: 'POST',
    path: '/update-progress',
    emoji: '✅',
    tagline: 'Track completed tasks — pure Python',
    color: '#30d158',
    fields: [
      { name: 'user_id', label: 'User ID', type: 'text', placeholder: 'uuid', default: 'demo-user-001' },
    ],
    buildSteps: buildProgressSteps,
    buildBody: (form) => ({ user_id: form['user_id'] || 'demo-user-001', completed_task_ids: ['day1-task1', 'day1-task2'] }),
  },
  {
    id: 'get-progress',
    label: 'GET /progress/:id',
    method: 'GET',
    path: '/progress/demo-user-001',
    emoji: '📊',
    tagline: 'Restore plan and progress state',
    color: '#64d2ff',
    fields: [
      { name: 'user_id', label: 'User ID', type: 'text', placeholder: 'uuid', default: 'demo-user-001' },
    ],
    buildSteps: buildGetProgressSteps,
    buildBody: () => null,
  },
];
