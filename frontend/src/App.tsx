import { useState, useRef, useEffect, createContext, useContext } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import {
  login as apiLogin,
  cadastrarUsuario as apiCadastrarUsuario,
  logout as apiLogout,
  obterUsuarioAtual,
  listarTarefas,
  criarTarefa,
  atualizarTarefa,
  excluirTarefa,
  listarProjetos,
  criarProjeto,
  atualizarProjeto,
  excluirProjeto,
  ApiError,
  Usuario as ApiUsuario,
  TarefaApi,
  TarefaPayload,
  ProjetoApi,
  MetaApi,
  MetaPayload,
  listarMetas,
  criarMeta,
  atualizarMeta,
  excluirMeta,
} from "./services/api";

// ─── Types ────────────────────────────────────────────────────────────────────
type Screen =
  | "landing" | "login" | "create-account" | "recover-password"
  | "onboarding"
  | "dashboard" | "tasks" | "projects" | "goals" | "reports"
  | "templates" | "settings" | "profile";

type EnergyLevel = "Alta" | "Média" | "Baixa";
type PomodoroStatus = "idle" | "focus" | "paused" | "break" | "done";

interface FocusSession {
  id: number; taskId: number; date: string; duration: number; completed: boolean;
}

interface PomodoroState {
  taskId: number | null;
  status: PomodoroStatus;
  secondsLeft: number;
  focusDuration: number;
  breakDuration: number;
  sessionCount: number;
}

type Priority = "Alta" | "Média" | "Baixa";
type TaskStatus = "A fazer" | "Em andamento" | "Concluída" | "Atrasada";
type Theme = "Claro" | "Escuro" | "Sistema";

interface Task {
  id: number; name: string; description: string; priority: Priority;
  status: TaskStatus; tags: string[]; dueDate: string; project: string;
  projectId?: number | null;
  goalId?: number;
  estimatedDuration?: number;
  energyRequirement?: EnergyLevel;
  totalFocusTime?: number;
  completedAt?: string;
}

interface Project {
  id: number; name: string; description: string; progress: number; done: number; total: number;
}

interface Goal {
  id: number; name: string; description: string; progress: number; dueDate: string;
  taskIds: number[];
  projectIds?: number[];
  concluida?: number;
}

interface Label {
  id: number; name: string; color: string; taskCount: number; created: string; filter: string;
}

interface UserAccount {
  id: string; name: string; email: string; password: string; avatar: string | null; isGoogle?: boolean;
}

interface UserData {
  tasks: Task[];
  projects: Project[];
  goals: Goal[];
  labels: Label[];
  theme: Theme;
  notifications: { expired: boolean; daily: boolean; weekly: boolean; push: boolean };
  gcalConnected: boolean;
  energyLevel: EnergyLevel | null;
  onboardingDone: boolean;
  focusSessions: FocusSession[];
}

// ─── Storage ──────────────────────────────────────────────────────────────────
const USERS_KEY = "organix_users";
const SESSION_KEY = "organix_session";
const dataKey = (id: string) => `organix_data_${id}`;
const themeKey = (id: string) => `organix_theme_${id}`;

function loadUserTheme(id: string): Theme {
  const saved = localStorage.getItem(themeKey(id));
  return saved === "Claro" || saved === "Escuro" || saved === "Sistema" ? saved : "Claro";
}

function saveUserTheme(id: string, theme: Theme) {
  localStorage.setItem(themeKey(id), theme);
}

function loadUsers(): UserAccount[] {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || "[]"); } catch { return []; }
}
function saveUsers(u: UserAccount[]) { localStorage.setItem(USERS_KEY, JSON.stringify(u)); }
function loadSession(): string | null { return localStorage.getItem(SESSION_KEY); }
function saveSession(id: string | null) { id ? localStorage.setItem(SESSION_KEY, id) : localStorage.removeItem(SESSION_KEY); }
function loadUserData(id: string): UserData {
  try { const s = localStorage.getItem(dataKey(id)); if (s) return JSON.parse(s); } catch {}
  return defaultUserData();
}
function saveUserData(id: string, d: UserData) { localStorage.setItem(dataKey(id), JSON.stringify(d)); }

function defaultUserData(): UserData {
  return {
    tasks: [],
    projects: [],
    goals: [],
    labels: [],
    theme: "Claro",
    notifications: { expired: true, daily: true, weekly: false, push: true },
    gcalConnected: false,
    energyLevel: null,
    onboardingDone: false,
    focusSessions: [],
  };
}

// ─── Templates (read-only) ────────────────────────────────────────────────────
const TEMPLATE_DATA: Record<string, string[]> = {
  "Rotina de Estudos": ["Revisar conteúdo do dia anterior", "Estudar tópico principal (2h)", "Resolver exercícios práticos", "Assistir videoaula complementar", "Anotar dúvidas para revisão", "Praticar questões de prova", "Descanso ativo — 15 min"],
  "Planejamento Semanal": ["Revisar metas da semana", "Definir prioridades diárias", "Agendar reuniões e compromissos", "Bloquear tempo para projetos", "Revisar e responder e-mails pendentes", "Fazer backup de arquivos importantes"],
  "Preparação para Prova": ["Montar cronograma de revisão", "Revisar anotações de cada tópico", "Resolver provas anteriores", "Identificar pontos fracos", "Revisar fórmulas e conceitos-chave", "Descansar bem na véspera"],
  "Organização de Casa": ["Limpar e organizar cada cômodo", "Fazer lista de compras de suprimentos", "Verificar validade de alimentos", "Organizar documentos em pastas", "Limpar área de trabalho/escritório"],
};

const TEMPLATES = [
  { name: "Rotina de Estudos", desc: "Organize sua rotina diária de estudos com tarefas estruturadas.", icon: "📚" },
  { name: "Planejamento Semanal", desc: "Monte seu planejamento semanal de forma eficiente.", icon: "📅" },
  { name: "Preparação para Prova", desc: "Checklist completo para se preparar para provas e concursos.", icon: "✍️" },
  { name: "Organização de Casa", desc: "Mantenha sua casa organizada com tarefas de manutenção.", icon: "🏠" },
];

// ─── Sidebar nav (sem Etiquetas e Filtros) ────────────────────────────────────
const NAV_ITEMS: { icon: string; label: string; screen: Screen }[] = [
  { icon: "▦", label: "Dashboard", screen: "dashboard" },
];

// ─── Contexts ─────────────────────────────────────────────────────────────────
interface AuthCtx {
  user: UserAccount | null;
  login: (email: string, password: string) => Promise<string | null>;
  loginGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<string | null>;
  updateUser: (patch: Partial<UserAccount>) => void;
  resetPassword: (email: string, newPassword: string) => void;
  findByEmail: (email: string) => UserAccount | undefined;
}
const AuthContext = createContext<AuthCtx>({} as AuthCtx);
const useAuth = () => useContext(AuthContext);

interface DataCtx {
  data: UserData;
  setTasks: (t: Task[]) => void;
  setProjects: (p: Project[]) => void;
  setGoals: (g: Goal[]) => void;
  setLabels: (l: Label[]) => void;
  setTheme: (t: Theme) => void;
  setNotifications: (n: UserData["notifications"]) => void;
  setGcal: (v: boolean) => void;
  setEnergyLevel: (e: EnergyLevel | null) => void;
  setOnboardingDone: () => void;
  addFocusSession: (s: FocusSession) => void;
}
const DataContext = createContext<DataCtx>({} as DataCtx);
const useData = () => useContext(DataContext);

interface PomodoroCtx {
  pomodoro: PomodoroState;
  startFocus: (taskId: number, minutes?: number) => void;
  pauseFocus: () => void;
  resumeFocus: () => void;
  stopFocus: (completed?: boolean) => void;
  startBreak: () => void;
}
const PomodoroContext = createContext<PomodoroCtx>({} as PomodoroCtx);
const usePomodoro = () => useContext(PomodoroContext);

// ─── Conversão de tarefas: React ↔ API ───────────────────────────────────────
function tarefaApiParaTask(t: TarefaApi): Task {
  const hoje = new Date().toISOString().split("T")[0];

  const prioridade: Priority =
    t.prioridade === "alta" ? "Alta" :
    t.prioridade === "baixa" ? "Baixa" :
    "Média";

  let status: TaskStatus =
    t.status === "concluida" ? "Concluída" :
    t.status === "em_andamento" ? "Em andamento" :
    "A fazer";

  // "Atrasada" é um estado visual do frontend.
  // No banco a tarefa continua como "pendente".
  if (
    status === "A fazer" &&
    t.prazo &&
    t.prazo < hoje
  ) {
    status = "Atrasada";
  }

  return {
    id: Number(t.id),
    name: t.titulo,
    description: t.descricao ?? "",
    priority: prioridade,
    status,
    tags: [],
    dueDate: t.prazo ?? "",
    project: t.projeto_nome ?? "",
    projectId: t.projeto_id == null ? null : Number(t.projeto_id),
    estimatedDuration: 25,
    energyRequirement: "Média",
    totalFocusTime: 0,
  };
}

function projetoApiParaProject(p: ProjetoApi): Project {
  return {
    id: Number(p.id),
    name: p.nome,
    description: p.descricao ?? "",
    progress: 0,
    done: 0,
    total: 0,
  };
}

function taskParaPayload(t: Task): TarefaPayload {
  return {
    projeto_id: t.projectId ?? null,
    titulo: t.name.trim(),
    descricao: t.description?.trim() ?? "",
    prioridade:
      t.priority === "Alta" ? "alta" :
      t.priority === "Baixa" ? "baixa" :
      "media",
    importante: 0,
    urgente: 0,
    status:
      t.status === "Concluída" ? "concluida" :
      t.status === "Em andamento" ? "em_andamento" :
      "pendente",
    prazo: t.dueDate || null,
  };
}

function metaApiParaGoal(m: MetaApi, tasks: Task[]): Goal {
  const goal: Goal = {
    id: Number(m.id),
    name: m.titulo,
    description: m.descricao ?? "",
    dueDate: m.prazo ?? "",
    projectIds: (m.projeto_ids ?? []).map(Number),
    taskIds: (m.tarefa_ids ?? []).map(Number),
    progress: 0,
    concluida: Number(m.concluida),
  };
  return { ...goal, progress: calcGoalProgress(goal, tasks) };
}

function goalParaPayload(g: Goal): MetaPayload {
  return {
    titulo: g.name.trim(),
    descricao: g.description ?? "",
    prazo: g.dueDate || null,
    concluida: g.concluida ?? 0,
    projeto_ids: g.projectIds ?? [],
    tarefa_ids: g.taskIds,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function calcGoalProgress(goal: Goal, tasks: Task[]): number {
  const ts = tasks.filter(t => goal.taskIds.includes(t.id));
  if (ts.length === 0) return 0;
  return Math.round(ts.filter(t => t.status === "Concluída").length / ts.length * 100);
}

function calcProjectProgress(project: Project, tasks: Task[]): { progress: number; done: number; total: number } {
  const pts = tasks.filter(t => t.projectId === project.id);
  const done = pts.filter(t => t.status === "Concluída").length;
  const total = pts.length;
  return { progress: total > 0 ? Math.round(done / total * 100) : 0, done, total };
}

// ─── UI primitives ────────────────────────────────────────────────────────────
function Overlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      {children}
    </div>
  );
}

function PriorityBadge({ p }: { p: Priority }) {
  const m: Record<Priority, string> = {
    Alta: "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400",
    Média: "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
    Baixa: "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
  };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${m[p]}`}>{p}</span>;
}

function StatusBadge({ s }: { s: TaskStatus }) {
  const m: Record<TaskStatus, string> = {
    "A fazer": "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
    "Em andamento": "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
    Concluída: "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400",
    Atrasada: "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400",
  };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${m[s]}`}>{s}</span>;
}

function TagBadge({ t }: { t: string }) {
  return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">{t}</span>;
}

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="text-4xl mb-3">{icon}</span>
      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{title}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-xs">{sub}</p>}
    </div>
  );
}

// ─── Task Modal ───────────────────────────────────────────────────────────────
function TaskModal({ onClose, onSave, initial, projects, goals }: {
  onClose: () => void;
  onSave: (t: Partial<Task>) => void;
  initial?: Partial<Task>;
  projects: Project[];
  goals?: Goal[];
}) {
  const [name, setName] = useState(initial?.name || "");
  const [desc, setDesc] = useState(initial?.description || "");
  const [priority, setPriority] = useState<Priority>(initial?.priority || "Média");
  const [status, setStatus] = useState<TaskStatus>(initial?.status || "A fazer");
  const [date, setDate] = useState(initial?.dueDate || "");
  const [project, setProject] = useState(initial?.project || "");
  const [projectId, setProjectId] = useState<number | null>(initial?.projectId ?? null);
  const [tags, setTags] = useState(initial?.tags?.join(", ") || "");
  const [goalId, setGoalId] = useState<number | undefined>(initial?.goalId);

  return (
    <Overlay onClose={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-5">{initial?.id ? "Editar Tarefa" : "Nova Tarefa"}</h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 block">Nome *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Estudar capítulo 3"
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200 focus:border-green-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 block">Descrição</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 block">Prioridade</label>
              <select value={priority} onChange={e => setPriority(e.target.value as Priority)}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200">
                {(["Alta", "Média", "Baixa"] as Priority[]).map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 block">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value as TaskStatus)}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200">
                {(["A fazer", "Em andamento", "Concluída", "Atrasada"] as TaskStatus[]).map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 block">Data de entrega</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 block">Projeto</label>
            <select value={projectId ?? ""} onChange={e => { const id = e.target.value ? Number(e.target.value) : null; const selecionado = projects.find(p => p.id === id); setProjectId(id); setProject(selecionado?.name ?? ""); }}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200">
              <option value="">Sem projeto</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {goals && goals.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 block">Meta</label>
              <select value={goalId || ""} onChange={e => setGoalId(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200">
                <option value="">Sem meta</option>
                {goals.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 block">Tags (separadas por vírgula)</label>
            <input value={tags} onChange={e => setTags(e.target.value)} placeholder="Ex: Trabalho, Urgente"
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200" />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancelar</button>
          <button disabled={!name.trim()} onClick={() => {
            if (!name.trim()) return;
            onSave({ name, description: desc, priority, status, dueDate: date, project, projectId, tags: tags.split(",").map(t => t.trim()).filter(Boolean), goalId });
            onClose();
          }} className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium transition-colors">
            {initial?.id ? "Salvar" : "Criar Tarefa"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// ─── Pomodoro helpers ─────────────────────────────────────────────────────────
function fmtSeconds(s: number) {
  const m = Math.floor(s / 60); const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function FocusModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const { pomodoro, startFocus, pauseFocus, resumeFocus, stopFocus, startBreak } = usePomodoro();
  const { data } = useData();
  const isThisTask = pomodoro.taskId === task.id;
  const sessions = data.focusSessions.filter(s => s.taskId === task.id);
  const totalFocus = sessions.reduce((a, s) => a + s.duration, 0);

  const statusLabel: Record<PomodoroStatus, string> = {
    idle: "Pronto para focar", focus: "Foco ativo", paused: "Pausado",
    break: "Pausa", done: "Sessão concluída",
  };

  return (
    <Overlay onClose={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-base leading-tight pr-4">{task.name}</h2>
            {task.project && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Projeto: {task.project}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none flex-shrink-0">×</button>
        </div>

        <div className="flex items-center gap-2 mb-5">
          <PriorityBadge p={task.priority} />
          <StatusBadge s={task.status} />
          {task.dueDate && <span className="text-xs text-gray-400 dark:text-gray-500">{task.dueDate}</span>}
        </div>

        <div className="border-t border-gray-100 dark:border-gray-800 pt-5">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 text-center">Modo Foco</p>

          {/* Timer circle */}
          <div className="flex flex-col items-center mb-5">
            <div className={`w-32 h-32 rounded-full border-4 flex items-center justify-center mb-2 transition-colors ${isThisTask && pomodoro.status === "focus" ? "border-green-400 bg-green-50 dark:bg-green-900/20" : isThisTask && pomodoro.status === "break" ? "border-blue-400 bg-blue-50 dark:bg-blue-900/20" : isThisTask && pomodoro.status === "done" ? "border-purple-400 bg-purple-50 dark:bg-purple-900/20" : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"}`}>
              <span className="text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
                {isThisTask ? fmtSeconds(pomodoro.secondsLeft) : fmtSeconds(25 * 60)}
              </span>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {isThisTask ? statusLabel[pomodoro.status] : statusLabel["idle"]}
            </p>
          </div>

          {/* Controls */}
          {(!isThisTask || pomodoro.status === "idle") && (
            <button onClick={() => startFocus(task.id)}
              className="w-full bg-green-600 hover:bg-green-700 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
              ▶ Iniciar foco (25 min)
            </button>
          )}
          {isThisTask && pomodoro.status === "focus" && (
            <div className="flex gap-2">
              <button onClick={pauseFocus} className="flex-1 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg py-2.5 text-sm font-medium transition-colors">⏸ Pausar</button>
              <button onClick={() => stopFocus(false)} className="flex-1 border border-red-200 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg py-2.5 text-sm font-medium transition-colors">Encerrar</button>
            </div>
          )}
          {isThisTask && pomodoro.status === "paused" && (
            <div className="flex gap-2">
              <button onClick={resumeFocus} className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">▶ Continuar</button>
              <button onClick={() => stopFocus(false)} className="flex-1 border border-red-200 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg py-2.5 text-sm font-medium transition-colors">Encerrar</button>
            </div>
          )}
          {isThisTask && pomodoro.status === "done" && (
            <div className="space-y-2">
              <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 text-center mb-3">
                <p className="text-sm font-semibold text-green-700 dark:text-green-400">🎯 Sessão de foco concluída</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Você focou por {pomodoro.focusDuration} minutos.</p>
              </div>
              <button onClick={startBreak} className="w-full border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg py-2 text-sm font-medium transition-colors">☕ Pausa de 5 min</button>
              <button onClick={() => startFocus(task.id)} className="w-full bg-green-600 hover:bg-green-700 text-white rounded-lg py-2 text-sm font-medium transition-colors">▶ Continuar foco</button>
              <button onClick={() => stopFocus(true)} className="w-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg py-2 text-sm font-medium transition-colors">Encerrar</button>
            </div>
          )}
          {isThisTask && pomodoro.status === "break" && (
            <div className="flex gap-2">
              <button onClick={() => startFocus(task.id)} className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">Retomar foco</button>
              <button onClick={() => stopFocus(false)} className="flex-1 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg py-2.5 text-sm font-medium transition-colors">Encerrar</button>
            </div>
          )}

          {/* Stats */}
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 grid grid-cols-2 gap-3">
            <div className="text-center"><p className="text-xs text-gray-400 dark:text-gray-500">Sessões</p><p className="text-lg font-bold text-gray-900 dark:text-gray-100">{sessions.length}</p></div>
            <div className="text-center"><p className="text-xs text-gray-400 dark:text-gray-500">Tempo focado</p><p className="text-lg font-bold text-gray-900 dark:text-gray-100">{totalFocus >= 60 ? `${Math.floor(totalFocus / 60)}h ${totalFocus % 60}min` : `${totalFocus} min`}</p></div>
          </div>
        </div>
      </div>
    </Overlay>
  );
}

// ─── Recommendation engine ────────────────────────────────────────────────────
function parseInputContext(input: string): { minutes: number | null; energy: EnergyLevel | null; keywords: string[] } {
  const lower = input.toLowerCase();
  let minutes: number | null = null;
  const hourMatch = lower.match(/(\d+)\s*hora/);
  const minMatch = lower.match(/(\d+)\s*min/);
  if (hourMatch) minutes = parseInt(hourMatch[1]) * 60;
  else if (minMatch) minutes = parseInt(minMatch[1]);
  let energy: EnergyLevel | null = null;
  if (/alta energia|energizado|animado/.test(lower)) energy = "Alta";
  else if (/pouca energia|cansado|baixa energia/.test(lower)) energy = "Baixa";
  const keywords = lower.split(/\s+/).filter(w => w.length > 3);
  return { minutes, energy, keywords };
}

function scoreTask(task: Task, ctx: { minutes: number | null; energy: EnergyLevel | null; energyLevel: EnergyLevel | null }, today: string): number {
  if (task.status === "Concluída") return -999;
  let score = 0;
  if (task.status === "Atrasada" || (task.dueDate && task.dueDate < today)) score += 100;
  if (task.dueDate === today) score += 50;
  if (task.priority === "Alta") score += 30;
  else if (task.priority === "Média") score += 15;
  else score += 5;
  const eff = ctx.energyLevel || ctx.energy;
  if (eff && task.energyRequirement === eff) score += 20;
  if (eff === "Baixa" && task.priority === "Baixa") score += 15;
  if (eff === "Alta" && task.priority === "Alta") score += 15;
  if (ctx.minutes && task.estimatedDuration && task.estimatedDuration <= ctx.minutes) score += 10;
  return score;
}

function getRecommendations(tasks: Task[], ctx: { minutes: number | null; energy: EnergyLevel | null; energyLevel: EnergyLevel | null }, today: string): Task[] {
  return [...tasks]
    .filter(t => t.status !== "Concluída")
    .map(t => ({ t, score: scoreTask(t, ctx, today) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(x => x.t);
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ current, onNav, open, onClose }: { current: Screen; onNav: (s: Screen) => void; open: boolean; onClose: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const { user, logout } = useAuth();
  const handleNav = (s: Screen) => { onNav(s); onClose(); };
  const handleLogout = async () => {
    onClose();
    await logout();
  };
  const initials = user?.name ? user.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?";

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/30 z-30 md:hidden" onClick={onClose} />}
      <aside className={`fixed left-0 top-0 h-screen w-56 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 flex flex-col z-40 transition-transform duration-200 md:hidden ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="px-5 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <span className="text-xl font-bold text-green-700 dark:text-green-500 tracking-tight">Organix</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">×</button>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {NAV_ITEMS.map(item => (
            <button key={item.screen} onClick={() => handleNav(item.screen)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium mb-0.5 transition-colors text-left ${current === item.screen ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"}`}>
              <span className="text-base w-5 text-center">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="border-t border-gray-100 dark:border-gray-800">
          <button disabled aria-label="Usuário local" className="w-full px-4 py-4 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            {user?.avatar ? <img src={user.avatar} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" /> : <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-green-700 dark:text-green-400 font-semibold text-sm flex-shrink-0">{initials}</div>}
            <div className="text-left flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-tight">{user?.name || "Usuário"}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{user?.email || ""}</p>
            </div>
          </button>
          <button hidden className="w-full px-4 py-3 flex items-center gap-3 text-sm font-medium text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left">
            <span className="w-8 text-center text-base flex-shrink-0">↪</span>
            <span>Sair</span>
          </button>
        </div>
      </aside>
      <aside onMouseEnter={() => setExpanded(true)} onMouseLeave={() => setExpanded(false)}
        style={{ width: expanded ? 224 : 64, transition: "width 180ms ease" }}
        className="hidden md:flex fixed left-0 top-0 h-screen bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 flex-col z-40 overflow-hidden">
        <div className="border-b border-gray-100 dark:border-gray-800 flex items-center h-[62px] flex-shrink-0 px-4">
          <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">O</div>
          <span style={{ opacity: expanded ? 1 : 0, transform: expanded ? "translateX(0)" : "translateX(-6px)", transition: "opacity 150ms ease, transform 150ms ease", transitionDelay: expanded ? "60ms" : "0ms", whiteSpace: "nowrap" }} className="ml-3 text-lg font-bold text-green-700 dark:text-green-500 tracking-tight">Organix</span>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {NAV_ITEMS.map(item => {
            const active = current === item.screen;
            return (
              <button key={item.screen} onClick={() => handleNav(item.screen)}
                className={`w-full flex items-center py-2 rounded-lg text-sm font-medium mb-0.5 transition-colors text-left ${active ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"}`}
                style={{ paddingLeft: 12, paddingRight: 12 }}>
                <span className="w-5 text-center text-base flex-shrink-0">{item.icon}</span>
                <span style={{ opacity: expanded ? 1 : 0, transform: expanded ? "translateX(0)" : "translateX(-8px)", transition: "opacity 140ms ease, transform 140ms ease", transitionDelay: expanded ? "70ms" : "0ms", whiteSpace: "nowrap", marginLeft: 12 }}>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
          <button disabled aria-label="Usuário local" className="w-full flex items-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors h-[62px] px-4">
            {user?.avatar ? <img src={user.avatar} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" /> : <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-green-700 dark:text-green-400 font-semibold text-sm flex-shrink-0">{initials}</div>}
            <div className="text-left overflow-hidden" style={{ opacity: expanded ? 1 : 0, transform: expanded ? "translateX(0)" : "translateX(-8px)", transition: "opacity 140ms ease, transform 140ms ease", transitionDelay: expanded ? "70ms" : "0ms", marginLeft: 12, whiteSpace: "nowrap" }}>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-tight">{user?.name || "Usuário"}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{user?.email || ""}</p>
            </div>
          </button>
          <button hidden className="w-full flex items-center h-[44px] px-4 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left">
            <span className="w-8 text-center text-base flex-shrink-0">↪</span>
            <span style={{ opacity: expanded ? 1 : 0, transform: expanded ? "translateX(0)" : "translateX(-8px)", transition: "opacity 140ms ease, transform 140ms ease", transitionDelay: expanded ? "70ms" : "0ms", whiteSpace: "nowrap", marginLeft: 12 }} className="text-sm font-medium">Sair</span>
          </button>
        </div>
      </aside>
    </>
  );
}

// ─── Inner Layout ─────────────────────────────────────────────────────────────
function InnerLayout({ current, onNav, children }: { current: Screen; onNav: (s: Screen) => void; children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
      <Sidebar current={current} onNav={onNav} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="md:hidden fixed top-0 left-0 right-0 h-12 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex items-center px-4 gap-3 z-20">
        <button onClick={() => setSidebarOpen(true)} className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 p-1">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <span className="text-base font-bold text-green-700 dark:text-green-500">Organix</span>
      </div>
      <main className="md:ml-16 flex-1 overflow-y-auto min-h-screen pt-12 md:pt-0">{children}</main>
    </div>
  );
}

// ─── Landing ──────────────────────────────────────────────────────────────────
function LandingPage({ onNav }: { onNav: (s: Screen) => void }) {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <header className="border-b border-gray-100 dark:border-gray-800 px-8 py-4 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-950 z-30">
        <span className="text-2xl font-bold text-green-700 dark:text-green-500 tracking-tight">Organix</span>
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600 dark:text-gray-400">
          <a href="#features" className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">Funcionalidades</a>
          <a href="#about" className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">Sobre o Organix</a>
        </nav>
        <div className="flex items-center gap-3">
          <button onClick={() => onNav("login")} className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 px-4 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Login</button>
          <button onClick={() => onNav("create-account")} className="text-sm font-medium bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors">Comece Agora</button>
        </div>
      </header>
      <section className="px-8 py-20 max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
        <div>
          <span className="inline-block text-xs font-semibold text-green-600 bg-green-50 dark:bg-green-900/20 px-3 py-1 rounded-full mb-5 tracking-wider uppercase">Produtividade pessoal</span>
          <h1 className="text-5xl font-bold text-gray-900 dark:text-gray-100 leading-tight mb-5">Organize.<br />Priorize.<br /><span className="text-green-600 dark:text-green-500">Conquiste.</span></h1>
          <p className="text-lg text-gray-500 dark:text-gray-400 leading-relaxed mb-8">O Organix é o sistema de gestão de tarefas que transforma seus objetivos em resultados. Simples, inteligente e feito para você.</p>
          <button onClick={() => onNav("create-account")} className="bg-green-600 hover:bg-green-700 text-white font-semibold px-8 py-3 rounded-xl text-base transition-colors">Comece gratuitamente →</button>
        </div>
        <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 shadow-lg">
          <div className="flex items-center gap-2 mb-3"><div className="w-2.5 h-2.5 rounded-full bg-red-300" /><div className="w-2.5 h-2.5 rounded-full bg-amber-300" /><div className="w-2.5 h-2.5 rounded-full bg-green-300" /></div>
          <div className="space-y-2">
            {[
              { name: "Revisar relatório trimestral", status: "Em andamento", priority: "Alta" as Priority },
              { name: "Estudar capítulo 5 de Cálculo", status: "A fazer", priority: "Alta" as Priority },
              { name: "Comprar mantimentos", status: "Concluída", priority: "Baixa" as Priority },
            ].map((task, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-100 dark:border-gray-700 flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${task.status === "Concluída" ? "bg-green-500" : task.status === "Em andamento" ? "bg-blue-500" : "bg-gray-300"}`} />
                <p className={`text-sm font-medium flex-1 ${task.status === "Concluída" ? "line-through text-gray-400" : "text-gray-800 dark:text-gray-200"}`}>{task.name}</p>
                <PriorityBadge p={task.priority} />
              </div>
            ))}
          </div>
        </div>
      </section>
      <section id="features" className="bg-gray-50 dark:bg-gray-900 px-8 py-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 text-center mb-12">Por que escolher o Organix?</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: "⚡", title: "Priorização por Impacto", desc: "Classifique tarefas por urgência e importância para focar no que realmente importa." },
              { icon: "📅", title: "Calendário Integrado", desc: "Visualize seus compromissos e prazos em uma visão de calendário completa e interativa." },
              { icon: "📊", title: "Progresso em Tempo Real", desc: "Acompanhe sua produtividade com relatórios visuais e indicadores de desempenho." },
            ].map(f => (
              <div key={f.title} className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700">
                <div className="w-10 h-10 bg-green-50 dark:bg-green-900/30 rounded-xl flex items-center justify-center text-xl mb-4">{f.icon}</div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section id="about" className="px-8 py-20 max-w-4xl mx-auto text-center">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">Sobre o Organix</h2>
        <p className="text-lg text-gray-500 dark:text-gray-400 leading-relaxed">Criado para pessoas que levam a sério sua produtividade, o Organix reúne gestão de tarefas, projetos e metas em um só lugar — com a simplicidade que você merece.</p>
      </section>
      <footer className="border-t border-gray-100 dark:border-gray-800 px-8 py-6 text-center text-sm text-gray-400">© 2026 Organix. Todos os direitos reservados.</footer>
    </div>
  );
}

// ─── Login ────────────────────────────────────────────────────────────────────
function LoginPage({ onNav }: { onNav: (s: Screen) => void }) {
  const { login, loginGoogle } = useAuth();
  const [email, setEmail] = useState(""); const [pwd, setPwd] = useState(""); const [error, setError] = useState("");
  const [googleModal, setGoogleModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const handle = async () => { if (!email.trim()) { setError("O e-mail é obrigatório."); return; } if (!pwd.trim()) { setError("A senha é obrigatória."); return; } setLoading(true); setError(""); const err = await login(email.trim(), pwd); setLoading(false); if (err) setError(err); };
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 w-full max-w-sm p-8">
        <div className="text-center mb-8"><span className="text-2xl font-bold text-green-700 dark:text-green-500">Organix</span><p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Acesse sua conta</p></div>
        {error && <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs rounded-lg px-3 py-2">{error}</div>}
        <div className="space-y-4">
          <div><label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 block">E-mail</label><input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(""); }} placeholder="seu@email.com" className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200" onKeyDown={e => e.key === "Enter" && handle()} /></div>
          <div><label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 block">Senha</label><input type="password" value={pwd} onChange={e => { setPwd(e.target.value); setError(""); }} placeholder="••••••••" className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200" onKeyDown={e => e.key === "Enter" && handle()} /></div>
          <button onClick={handle} className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors">Entrar</button>
          <div className="relative flex items-center gap-3"><div className="flex-1 border-t border-gray-200 dark:border-gray-700" /><span className="text-xs text-gray-400">ou</span><div className="flex-1 border-t border-gray-200 dark:border-gray-700" /></div>
          <button onClick={() => setGoogleModal(true)} className="w-full border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continuar com Google
          </button>
        </div>
        <div className="mt-5 space-y-2 text-center">
          <button onClick={() => onNav("recover-password")} className="text-xs text-green-600 dark:text-green-500 hover:text-green-700 block mx-auto">Esqueceu a senha?</button>
          <p className="text-xs text-gray-500 dark:text-gray-400">Não tem conta? <button onClick={() => onNav("create-account")} className="text-green-600 dark:text-green-500 font-medium hover:text-green-700">Criar conta</button></p>
        </div>
      </div>
      {googleModal && (
        <Overlay onClose={() => setGoogleModal(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Login com Google</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">Simulação — em produção abrirá o fluxo OAuth do Google.</p>
            <button onClick={() => { loginGoogle(); setGoogleModal(false); }} className="w-full bg-green-600 hover:bg-green-700 text-white rounded-lg py-2.5 text-sm font-medium transition-colors mb-3">Entrar como demo@google.com</button>
            <button onClick={() => setGoogleModal(false)} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Cancelar</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ─── Create Account ───────────────────────────────────────────────────────────
function CreateAccountPage({ onNav }: { onNav: (s: Screen) => void }) {
  const { register } = useAuth();
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [pwd, setPwd] = useState(""); const [confirm, setConfirm] = useState(""); const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const handle = async () => {
    if (!name.trim()) { setError("O nome é obrigatório."); return; }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Informe um e-mail válido."); return; }
    if (!pwd || pwd.length < 6) { setError("A senha deve ter pelo menos 6 caracteres."); return; }
    if (pwd !== confirm) { setError("A senha e a confirmação não coincidem."); return; }
    setLoading(true); setError("");
    const err = await register(name.trim(), email.trim(), pwd);
    setLoading(false);
    if (err) { setError(err); return; }
  };
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 w-full max-w-sm p-8">
        <div className="text-center mb-8"><span className="text-2xl font-bold text-green-700 dark:text-green-500">Organix</span><p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Crie sua conta gratuita</p></div>
        {error && <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs rounded-lg px-3 py-2">{error}</div>}
        <div className="space-y-4">
          {[{ label: "Nome completo", type: "text", value: name, set: setName, ph: "Ana Lima" }, { label: "E-mail", type: "email", value: email, set: setEmail, ph: "seu@email.com" }, { label: "Senha (mín. 6 caracteres)", type: "password", value: pwd, set: setPwd, ph: "••••••••" }, { label: "Confirmar senha", type: "password", value: confirm, set: setConfirm, ph: "••••••••" }].map(f => (
            <div key={f.label}><label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 block">{f.label}</label><input type={f.type} value={f.value} onChange={e => { f.set(e.target.value); setError(""); }} placeholder={f.ph} className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200" onKeyDown={e => e.key === "Enter" && handle()} /></div>
          ))}
          <button onClick={handle} className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors mt-2">Criar Conta</button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-5">Já tem conta? <button onClick={() => onNav("login")} className="text-green-600 dark:text-green-500 font-medium hover:text-green-700">Entrar</button></p>
      </div>
    </div>
  );
}

// ─── Recover Password ─────────────────────────────────────────────────────────
function RecoverPasswordPage({ onNav }: { onNav: (s: Screen) => void }) {
  const { findByEmail, resetPassword } = useAuth();
  const [step, setStep] = useState<"email" | "code" | "newpass" | "done">("email");
  const [email, setEmail] = useState(""); const [enteredCode, setEnteredCode] = useState(""); const [newPwd, setNewPwd] = useState(""); const [confirmPwd, setConfirmPwd] = useState(""); const [error, setError] = useState("");
  const [generatedCode] = useState(() => Math.floor(100000 + Math.random() * 900000).toString());
  const [tab, setTab] = useState<"senha" | "email">("senha");
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 w-full max-w-sm p-8">
        <div className="text-center mb-8"><span className="text-2xl font-bold text-green-700 dark:text-green-500">Organix</span><p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Recuperar acesso</p></div>
        {step === "done" ? (
          <div className="text-center">
            <div className="w-14 h-14 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">✓</div>
            <p className="text-sm text-gray-700 dark:text-gray-300 font-medium mb-2">Senha redefinida com sucesso!</p>
            <button onClick={() => onNav("login")} className="w-full bg-green-600 hover:bg-green-700 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">Ir para o login</button>
          </div>
        ) : (
          <>
            <div className="flex mb-6 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              {(["senha", "email"] as const).map(t => <button key={t} onClick={() => { setTab(t); setStep("email"); setError(""); setEmail(""); }} className={`flex-1 py-2 text-xs font-medium transition-colors capitalize ${tab === t ? "bg-green-600 text-white" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"}`}>Recuperar {t}</button>)}
            </div>
            {error && <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs rounded-lg px-3 py-2">{error}</div>}
            {step === "email" && <div className="space-y-4"><p className="text-sm text-gray-500 dark:text-gray-400">{tab === "senha" ? "Informe seu e-mail para receber um código." : "Informe o e-mail para localizar sua conta."}</p><div><label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 block">E-mail</label><input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(""); }} placeholder="seu@email.com" className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200" /></div><button onClick={() => { if (!email.trim()) { setError("Informe o e-mail."); return; } if (!findByEmail(email.trim())) { setError("Nenhuma conta encontrada."); return; } setError(""); setStep("code"); }} className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors">{tab === "senha" ? "Enviar código" : "Verificar conta"}</button></div>}
            {step === "code" && <div className="space-y-4"><div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3"><p className="text-xs text-amber-700 dark:text-amber-400 font-medium mb-1">Modo demonstração</p><p className="text-xs text-amber-600 dark:text-amber-500">Código: <strong className="text-lg tracking-widest">{generatedCode}</strong></p></div><div><label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 block">Código</label><input value={enteredCode} onChange={e => { setEnteredCode(e.target.value); setError(""); }} placeholder="000000" maxLength={6} className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200 text-center tracking-widest text-lg" /></div><button onClick={() => { if (enteredCode !== generatedCode) { setError("Código inválido."); return; } setError(""); tab === "senha" ? setStep("newpass") : setStep("done"); }} className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors">Verificar</button></div>}
            {step === "newpass" && <div className="space-y-4"><p className="text-sm text-gray-500 dark:text-gray-400">Nova senha para <strong>{email}</strong></p><div><label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 block">Nova senha</label><input type="password" value={newPwd} onChange={e => { setNewPwd(e.target.value); setError(""); }} placeholder="••••••••" className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200" /></div><div><label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 block">Confirmar</label><input type="password" value={confirmPwd} onChange={e => { setConfirmPwd(e.target.value); setError(""); }} placeholder="••••••••" className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200" /></div><button onClick={() => { if (!newPwd || newPwd.length < 6) { setError("Mín. 6 caracteres."); return; } if (newPwd !== confirmPwd) { setError("As senhas não coincidem."); return; } resetPassword(email.trim(), newPwd); setStep("done"); }} className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors">Salvar nova senha</button></div>}
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-5"><button onClick={() => onNav("login")} className="text-green-600 dark:text-green-500 font-medium hover:text-green-700">← Voltar ao login</button></p>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function DashboardPage({ onNav }: { onNav: (s: Screen) => void }) {
  const { user } = useAuth();
  const { data, setTasks, setGoals, setEnergyLevel } = useData();
  const { tasks, projects, goals } = data;
  const { pomodoro, stopFocus, resumeFocus, pauseFocus } = usePomodoro();
  const today = new Date(); const todayStr = today.toISOString().split("T")[0];
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [calYear, setCalYear] = useState(today.getFullYear()); const [calMonth, setCalMonth] = useState(today.getMonth());
  const [calModal, setCalModal] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false); const [pickerYear, setPickerYear] = useState(today.getFullYear());
  const [filterModal, setFilterModal] = useState<{ label: string; filter: TaskStatus | null } | null>(null);
  const [assistInput, setAssistInput] = useState(""); const [suggestions, setSuggestions] = useState<Task[]>([]);
  const [focusTask, setFocusTask] = useState<Task | null>(null);
  const todayTasks = tasks.filter(t => t.dueDate === todayStr);
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const monthName = new Date(calYear, calMonth, 1).toLocaleString("pt-BR", { month: "long" });
  const calDateStr = (day: number) => `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const MONTHS_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const firstName = user?.name?.split(" ")[0] || "Usuário";
  const stats = [
    { label: "Tarefas Hoje", value: todayTasks.length, color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/20", filter: null as TaskStatus | null },
    { label: "Em Andamento", value: tasks.filter(t => t.status === "Em andamento").length, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/20", filter: "Em andamento" as TaskStatus },
    { label: "Atrasadas", value: tasks.filter(t => t.status === "Atrasada").length, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/20", filter: "Atrasada" as TaskStatus },
    { label: "Concluídas", value: tasks.filter(t => t.status === "Concluída").length, color: "text-gray-600 dark:text-gray-400", bg: "bg-gray-100 dark:bg-gray-800", filter: "Concluída" as TaskStatus },
  ];
  // Indicadores calculados a partir das tarefas e projetos carregados pela API.
  const totalTarefas = tasks.length;
  const tarefasConcluidas = tasks.filter(t => t.status === "Concluída").length;
  const tarefasEmAndamento = tasks.filter(t => t.status === "Em andamento").length;
  const tarefasPendentes = tasks.filter(t => t.status === "A fazer" || t.status === "Atrasada").length;
  const percentualConclusao = totalTarefas > 0 ? Math.round((tarefasConcluidas / totalTarefas) * 100) : 0;
  const projetosComProgresso = projects.map(project => ({
    ...project,
    ...calcProjectProgress(project, tasks),
  }));
  const projetosAtivos = projetosComProgresso.filter(project => project.total > 0 && project.progress < 100).length;
  const metasComTarefas = goals.filter(goal => goal.taskIds.length > 0);
  const progressoMedioMetas = metasComTarefas.length > 0
    ? Math.round(metasComTarefas.reduce((total, goal) => total + calcGoalProgress(goal, tasks), 0) / metasComTarefas.length)
    : 0;
  const handleNewTask = (t: Partial<Task>) => {
    const newTask = { ...t, id: Date.now(), status: t.status || "A fazer" } as Task;
    const newTasks = [...tasks, newTask];
    setTasks(newTasks);
    if (t.goalId) setGoals(goals.map(g => g.id === t.goalId ? { ...g, taskIds: [...g.taskIds, newTask.id], progress: calcGoalProgress({ ...g, taskIds: [...g.taskIds, newTask.id] }, newTasks) } : g));
  };
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div><h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Olá, {firstName}! 👋</h1><p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{today.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</p></div>
        <button onClick={() => setShowTaskModal(true)} className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"><span>+</span> Nova Tarefa</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        {stats.map(s => <button key={s.label} onClick={() => setFilterModal({ label: s.label, filter: s.filter })} className={`${s.bg} rounded-xl p-4 text-left hover:opacity-80 transition-opacity`}><p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{s.label}</p><p className={`text-3xl font-bold ${s.color}`}>{s.value}</p></button>)}
      </div>

      {/* Resumo de produtividade — dados reais do estado sincronizado com a API */}
      <section className="mb-5" aria-label="Resumo de produtividade">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Visão geral da produtividade</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Resumo atualizado conforme suas tarefas, projetos e metas.</p>
          </div>
          <button disabled title="Relatórios fora desta versão" className="text-xs font-semibold text-green-700 dark:text-green-400 hover:underline">Ver relatórios →</button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Taxa de conclusão</p>
            <div className="flex items-end gap-2 mt-2 mb-3">
              <span className="text-3xl font-bold text-green-700 dark:text-green-400 tabular-nums">{percentualConclusao}%</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 mb-1">{tarefasConcluidas} de {totalTarefas} tarefas</span>
            </div>
            <div role="progressbar" aria-label="Tarefas concluídas" aria-valuenow={percentualConclusao} aria-valuemin={0} aria-valuemax={100} className="h-2.5 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
              <div className="h-full bg-green-600 rounded-full transition-all duration-300" style={{ width: `${percentualConclusao}%` }} />
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">{totalTarefas === 0 ? "Cadastre sua primeira tarefa para acompanhar o progresso." : "Percentual de tarefas concluídas no total cadastrado."}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">Situação das tarefas</p>
            <div className="space-y-3">
              {[
                { label: "Concluídas", count: tarefasConcluidas, color: "bg-green-500" },
                { label: "Em andamento", count: tarefasEmAndamento, color: "bg-blue-500" },
                { label: "Pendentes e atrasadas", count: tarefasPendentes, color: "bg-amber-500" },
              ].map(item => (
                <div key={item.label}>
                  <div className="flex justify-between text-xs mb-1"><span className="text-gray-600 dark:text-gray-400">{item.label}</span><span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{item.count}</span></div>
                  <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden"><div className={`h-full rounded-full ${item.color}`} style={{ width: `${totalTarefas > 0 ? (item.count / totalTarefas) * 100 : 0}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">Projetos e metas</p>
            <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800"><span className="text-sm text-gray-600 dark:text-gray-400">Projetos cadastrados</span><span className="text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums">{projects.length}</span></div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800"><span className="text-sm text-gray-600 dark:text-gray-400">Projetos em andamento</span><span className="text-lg font-bold text-blue-600 dark:text-blue-400 tabular-nums">{projetosAtivos}</span></div>
            <div className="flex items-center justify-between py-2"><span className="text-sm text-gray-600 dark:text-gray-400">Progresso médio das metas*</span><span className="text-lg font-bold text-green-700 dark:text-green-400 tabular-nums">{progressoMedioMetas}%</span></div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">*Calculado sobre metas com tarefas vinculadas.</p>
          </div>
        </div>
        {projetosComProgresso.length > 0 && (
          <div className="mt-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
            <div className="flex items-center justify-between gap-3 mb-4"><h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Progresso dos projetos</h3><button disabled title="Projetos fora desta versão" className="text-xs text-green-700 dark:text-green-400 hover:underline">Ver projetos →</button></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {projetosComProgresso.slice(0, 4).map(project => (
                <div key={project.id}>
                  <div className="flex justify-between items-center gap-3 text-xs mb-1.5"><span className="font-medium text-gray-700 dark:text-gray-300 truncate" title={project.name}>{project.name}</span><span className="text-gray-500 dark:text-gray-400 flex-shrink-0 tabular-nums">{project.done}/{project.total} · {project.progress}%</span></div>
                  <div role="progressbar" aria-label={`Progresso do projeto ${project.name}`} aria-valuenow={project.progress} aria-valuemin={0} aria-valuemax={100} className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden"><div className="h-full rounded-full bg-green-600 transition-all duration-300" style={{ width: `${project.progress}%` }} /></div>
                </div>
              ))}
            </div>
            {projetosComProgresso.length > 4 && <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">Exibindo 4 de {projetosComProgresso.length} projetos.</p>}
          </div>
        )}
      </section>

      {/* Active focus banner */}
      {pomodoro.status !== "idle" && pomodoro.taskId && (() => {
        const ft = tasks.find(t => t.id === pomodoro.taskId);
        return ft ? (
          <div className="mb-5 flex items-center gap-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-green-700 dark:text-green-400">Foco ativo</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{ft.name}</p>
            </div>
            <span className="text-xl font-bold text-green-700 dark:text-green-400 tabular-nums">{fmtSeconds(pomodoro.secondsLeft)}</span>
            {pomodoro.status === "focus" ? (
              <button onClick={pauseFocus} className="text-xs border border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 px-2 py-1 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors">Pausar</button>
            ) : (
              <button onClick={resumeFocus} className="text-xs bg-green-600 text-white px-2 py-1 rounded-lg hover:bg-green-700 transition-colors">Retomar</button>
            )}
            <button onClick={() => { setFocusTask(ft); }} className="text-xs border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">Ver</button>
          </div>
        ) : null;
      })()}

      {/* Energy + Assistant row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        {/* Energy card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Como está sua energia?</p>
          <div className="flex gap-2 mb-2">
            {(["Alta", "Média", "Baixa"] as EnergyLevel[]).map(lvl => {
              const icons: Record<EnergyLevel, string> = { Alta: "⚡", Média: "◉", Baixa: "○" };
              const colors: Record<EnergyLevel, string> = {
                Alta: "border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400",
                Média: "border-blue-400 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400",
                Baixa: "border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
              };
              const sel = data.energyLevel === lvl;
              return (
                <button key={lvl} onClick={() => setEnergyLevel(sel ? null : lvl)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-medium transition-colors ${sel ? colors[lvl] : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"}`}>
                  {icons[lvl]} {lvl}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">{data.energyLevel ? `O Organix usará isso para sugerir tarefas compatíveis.` : "Defina sua energia para receber sugestões mais adequadas."}</p>
        </div>

        {/* Assistant card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">O que devo fazer agora?</p>
          <div className="flex gap-2 mb-2">
            <input value={assistInput} onChange={e => setAssistInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { const ctx = parseInputContext(assistInput); setSuggestions(getRecommendations(tasks, { ...ctx, energyLevel: data.energyLevel }, todayStr)); } }}
              placeholder="Ex: Tenho 30 minutos livres..."
              className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200" />
            <button onClick={() => { const ctx = parseInputContext(assistInput); setSuggestions(getRecommendations(tasks, { ...ctx, energyLevel: data.energyLevel }, todayStr)); }}
              className="bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 rounded-lg transition-colors">Sugerir</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["15 min", "30 min", "1 hora", "2 horas"].map(q => (
              <button key={q} onClick={() => { setAssistInput(q); const ctx = parseInputContext(q); setSuggestions(getRecommendations(tasks, { ...ctx, energyLevel: data.energyLevel }, todayStr)); }}
                className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 hover:text-green-700 dark:hover:text-green-400 transition-colors">
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Suggestion results */}
      {suggestions.length > 0 && (
        <div className="mb-5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sugestões do Organix</p>
            <button onClick={() => setSuggestions([])} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">×</button>
          </div>
          <div className="space-y-2">
            {suggestions.map((t, i) => (
              <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                <span className="text-base font-bold text-gray-300 dark:text-gray-600 w-5 flex-shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{t.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <PriorityBadge p={t.priority} />
                    {t.estimatedDuration && <span className="text-xs text-gray-400 dark:text-gray-500">~{t.estimatedDuration} min</span>}
                    {t.dueDate && <span className="text-xs text-gray-400 dark:text-gray-500">{t.dueDate === todayStr ? "Hoje" : t.dueDate}</span>}
                  </div>
                </div>
                <button onClick={() => setFocusTask(t)} className="bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors flex-shrink-0">▶ Focar</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="relative">
              <button onClick={() => setShowPicker(v => !v)} className="font-semibold text-gray-900 dark:text-gray-100 capitalize hover:text-green-700 dark:hover:text-green-500 transition-colors text-sm">{monthName} {calYear}</button>
              {showPicker && (
                <div className="absolute top-7 left-0 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-4 w-64">
                  <div className="flex items-center justify-between mb-3"><button onClick={() => setPickerYear(y => y - 1)} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-1">◀</button><span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{pickerYear}</span><button onClick={() => setPickerYear(y => y + 1)} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-1">▶</button></div>
                  <div className="grid grid-cols-3 gap-1">{MONTHS_PT.map((m, i) => <button key={m} onClick={() => { setCalYear(pickerYear); setCalMonth(i); setShowPicker(false); }} className={`text-xs py-1.5 rounded-lg transition-colors font-medium ${calMonth === i && calYear === pickerYear ? "bg-green-600 text-white" : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"}`}>{m.slice(0, 3)}</button>)}</div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => { setCalYear(today.getFullYear()); setCalMonth(today.getMonth()); setShowPicker(false); }} className="text-xs text-green-600 dark:text-green-500 font-medium px-2 py-1 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors">Hoje</button>
              <button onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm">◀</button>
              <button onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm">▶</button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center mb-2">{["D","S","T","Q","Q","S","S"].map((d, i) => <div key={i} className="text-xs text-gray-400 dark:text-gray-500 font-medium py-1">{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dt = calDateStr(day);
              const dayTasks = tasks.filter(t => t.dueDate === dt);
              const isToday = day === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();

              const dayPriority: Priority | null =
                dayTasks.some(t => t.priority === "Alta") ? "Alta" :
                dayTasks.some(t => t.priority === "Média") ? "Média" :
                dayTasks.some(t => t.priority === "Baixa") ? "Baixa" :
                null;

              const priorityStyle =
                dayPriority === "Alta"
                  ? "bg-red-100 dark:bg-red-900/35 text-red-700 dark:text-red-300 border-red-400 dark:border-red-700 hover:bg-red-200 dark:hover:bg-red-900/50"
                  : dayPriority === "Média"
                  ? "bg-amber-100 dark:bg-amber-900/35 text-amber-800 dark:text-amber-300 border-amber-400 dark:border-amber-700 hover:bg-amber-200 dark:hover:bg-amber-900/50"
                  : dayPriority === "Baixa"
                  ? "bg-blue-100 dark:bg-blue-900/35 text-blue-700 dark:text-blue-300 border-blue-400 dark:border-blue-700 hover:bg-blue-200 dark:hover:bg-blue-900/50"
                  : isToday
                  ? "bg-green-600 text-white border-green-600 hover:bg-green-700"
                  : "text-gray-700 dark:text-gray-300 border-transparent hover:bg-gray-100 dark:hover:bg-gray-800";

              return (
                <button
                  key={day}
                  onClick={() => setCalModal(dt)}
                  title={
                    dayTasks.length > 0
                      ? `${dayTasks.length} tarefa${dayTasks.length > 1 ? "s" : ""} — prioridade ${dayPriority}`
                      : undefined
                  }
                  className={`relative min-h-[34px] rounded-md border text-xs font-semibold transition-all ${priorityStyle} ${isToday && dayPriority ? "ring-2 ring-green-500 ring-offset-1 dark:ring-offset-gray-900" : ""}`}
                >
                  <span>{day}</span>
                  {dayTasks.length > 1 && (
                    <span className="absolute top-0.5 right-1 text-[9px] font-bold leading-none opacity-80">
                      {dayTasks.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="lg:col-span-3 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Tarefas de Hoje</h2>
          {todayTasks.length === 0 ? <EmptyState icon="☀️" title="Nenhuma tarefa para hoje" sub="Crie uma tarefa com vencimento hoje para ela aparecer aqui." /> : (
            <div className="space-y-2">
              {todayTasks.map(task => (
                <button key={task.id} onClick={() => setEditTask(task)} className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left">
                  <div className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${task.status === "Concluída" ? "bg-green-500" : task.status === "Em andamento" ? "bg-blue-500" : task.status === "Atrasada" ? "bg-red-400" : "bg-gray-300"}`} />
                  <div className="flex-1 min-w-0"><p className={`text-sm font-medium ${task.status === "Concluída" ? "line-through text-gray-400" : "text-gray-800 dark:text-gray-200"}`}>{task.name}</p><p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{task.project || "Sem projeto"}</p></div>
                  <div className="flex items-center gap-2"><PriorityBadge p={task.priority} /><StatusBadge s={task.status} /></div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {focusTask && <FocusModal task={focusTask} onClose={() => setFocusTask(null)} />}
      {showTaskModal && <TaskModal projects={projects} goals={goals} onClose={() => setShowTaskModal(false)} onSave={handleNewTask} />}
      {editTask && <TaskModal initial={editTask} projects={projects} goals={goals} onClose={() => setEditTask(null)} onSave={updated => { setTasks(tasks.map(t => t.id === editTask.id ? { ...t, ...updated } : t)); setEditTask(null); }} />}
      {calModal && (
        <Overlay onClose={() => setCalModal(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4"><h2 className="font-semibold text-gray-900 dark:text-gray-100">Tarefas — {calModal}</h2><button onClick={() => setCalModal(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg">×</button></div>
            {tasks.filter(t => t.dueDate === calModal).length === 0 ? <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">Nenhuma tarefa para este dia.</p> : tasks.filter(t => t.dueDate === calModal).map(task => <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-800 mb-2"><div className={`w-2 h-2 rounded-full flex-shrink-0 ${task.status === "Concluída" ? "bg-green-500" : task.status === "Em andamento" ? "bg-blue-500" : "bg-gray-300"}`} /><span className="text-sm text-gray-800 dark:text-gray-200 flex-1">{task.name}</span><PriorityBadge p={task.priority} /></div>)}
            <button onClick={() => { setShowTaskModal(true); setCalModal(null); }} className="mt-3 w-full border border-dashed border-green-300 dark:border-green-700 text-green-600 dark:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg py-2 text-sm font-medium transition-colors">+ Nova tarefa</button>
          </div>
        </Overlay>
      )}
      {filterModal && (
        <Overlay onClose={() => setFilterModal(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4"><h2 className="font-semibold text-gray-900 dark:text-gray-100">{filterModal.label}</h2><button onClick={() => setFilterModal(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg">×</button></div>
            {(() => { const filtered = filterModal.filter ? tasks.filter(t => t.status === filterModal.filter) : todayTasks; return filtered.length === 0 ? <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">Nenhuma tarefa.</p> : filtered.map(task => <div key={task.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-800 mb-2"><div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${task.status === "Concluída" ? "bg-green-500" : task.status === "Em andamento" ? "bg-blue-500" : task.status === "Atrasada" ? "bg-red-400" : "bg-gray-300"}`} /><div className="flex-1"><p className="text-sm font-medium text-gray-800 dark:text-gray-200">{task.name}</p><p className="text-xs text-gray-400 dark:text-gray-500">{task.description}</p></div><div className="flex flex-col gap-1 items-end"><PriorityBadge p={task.priority} /><span className="text-xs text-gray-400 dark:text-gray-500">{task.dueDate}</span></div></div>); })()}
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ─── Tasks Page ───────────────────────────────────────────────────────────────
function TasksPage() {
  const { data, setTasks, setGoals } = useData();
  const { tasks, projects, goals, labels } = data;
  const [search, setSearch] = useState(""); const [statusFilter, setStatusFilter] = useState("Todas"); const [priorityFilter, setPriorityFilter] = useState("Todas"); const [projectFilter, setProjectFilter] = useState("Todos"); const [goalFilter, setGoalFilter] = useState("Todas"); const [tagFilter, setTagFilter] = useState("Todas"); const [dateFilter, setDateFilter] = useState("Todas");
  const [showFilters, setShowFilters] = useState(false); const [showModal, setShowModal] = useState(false); const [editTask, setEditTask] = useState<Task | null>(null);
  const [focusTask, setFocusTask] = useState<Task | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const today = new Date().toISOString().split("T")[0];
  const weekEnd = new Date(Date.now() + 7 * 864e5).toISOString().split("T")[0];
  const allTags = Array.from(new Set([...tasks.flatMap(t => t.tags), ...labels.map(l => l.name)]));
  const filtered = tasks.filter(t => {
    if (search) { const q = search.toLowerCase(); if (!t.name.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false; }
    if (statusFilter !== "Todas" && t.status !== statusFilter) return false;
    if (priorityFilter !== "Todas" && t.priority !== priorityFilter) return false;
    if (projectFilter !== "Todos") { if (projectFilter === "" && t.project) return false; if (projectFilter !== "" && t.project !== projectFilter) return false; }
    if (goalFilter !== "Todas") { const goal = goals.find(g => g.name === goalFilter); if (!goal || !goal.taskIds.includes(t.id)) return false; }
    if (tagFilter !== "Todas" && !t.tags.includes(tagFilter)) return false;
    if (dateFilter === "Hoje" && t.dueDate !== today) return false;
    if (dateFilter === "Esta semana" && (t.dueDate < today || t.dueDate > weekEnd)) return false;
    if (dateFilter === "Atrasadas" && (t.dueDate >= today || !t.dueDate)) return false;
    if (dateFilter === "Sem prazo" && t.dueDate) return false;
    return true;
  });
  const activeFilters = [priorityFilter !== "Todas", projectFilter !== "Todos", goalFilter !== "Todas", tagFilter !== "Todas", dateFilter !== "Todas"].filter(Boolean).length;
  const handleEdit = (updated: Partial<Task>) => {
    if (!editTask) return;
    const oldGoalId = editTask.goalId; const newGoalId = updated.goalId;
    const newTasks = tasks.map(t => t.id === editTask.id ? { ...t, ...updated } : t);
    setTasks(newTasks);
    if (oldGoalId !== newGoalId) {
      let newGoals = goals;
      if (oldGoalId) newGoals = newGoals.map(g => g.id === oldGoalId ? { ...g, taskIds: g.taskIds.filter(id => id !== editTask.id) } : g);
      if (newGoalId) newGoals = newGoals.map(g => g.id === newGoalId && !g.taskIds.includes(editTask.id) ? { ...g, taskIds: [...g.taskIds, editTask.id] } : g);
      setGoals(newGoals.map(g => ({ ...g, progress: calcGoalProgress(g, newTasks) })));
    } else { setGoals(goals.map(g => ({ ...g, progress: calcGoalProgress(g, newTasks) }))); }
    setEditTask(null);
  };
  const handleDelete = (id: number) => {
    const task = tasks.find(t => t.id === id); const newTasks = tasks.filter(t => t.id !== id); setTasks(newTasks);
    if (task?.goalId) setGoals(goals.map(g => g.id === task.goalId ? { ...g, taskIds: g.taskIds.filter(i => i !== id), progress: calcGoalProgress({ ...g, taskIds: g.taskIds.filter(i => i !== id) }, newTasks) } : g));
    else setGoals(goals.map(g => ({ ...g, progress: calcGoalProgress(g, newTasks) })));
  };
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6"><h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Tarefas</h1><button onClick={() => setShowModal(true)} className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"><span>+</span> Nova Tarefa</button></div>
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-visible">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex flex-col gap-3">
          <div className="flex gap-3">
            <div className="flex-1 relative"><svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por título ou descrição..." className="w-full border border-gray-200 dark:border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200" /></div>
            <button onClick={() => setShowFilters(v => !v)} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${showFilters || activeFilters > 0 ? "border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              Filtros {activeFilters > 0 && <span className="w-4 h-4 rounded-full bg-green-600 text-white text-xs flex items-center justify-center">{activeFilters}</span>}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">{["Todas", "A fazer", "Em andamento", "Concluída", "Atrasada"].map(s => <button key={s} onClick={() => setStatusFilter(s)} className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${statusFilter === s ? "bg-green-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}>{s}</button>)}</div>
          {showFilters && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1 border-t border-gray-100 dark:border-gray-800">
              <div><label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Prioridade</label><select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200"><option>Todas</option><option>Alta</option><option>Média</option><option>Baixa</option></select></div>
              <div><label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Projeto</label><select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200"><option value="Todos">Todos</option><option value="">Sem projeto</option>{projects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}</select></div>
              <div><label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Meta</label><select value={goalFilter} onChange={e => setGoalFilter(e.target.value)} className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200"><option value="Todas">Todas</option>{goals.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}</select></div>
              <div><label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Tag</label><select value={tagFilter} onChange={e => setTagFilter(e.target.value)} className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200"><option value="Todas">Todas</option>{allTags.map(t => <option key={t}>{t}</option>)}</select></div>
              <div><label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Prazo</label><select value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200"><option value="Todas">Todas</option><option>Hoje</option><option>Esta semana</option><option>Atrasadas</option><option>Sem prazo</option></select></div>
              {activeFilters > 0 && <div className="flex items-end"><button onClick={() => { setPriorityFilter("Todas"); setProjectFilter("Todos"); setGoalFilter("Todas"); setTagFilter("Todas"); setDateFilter("Todas"); }} className="text-xs text-red-500 hover:text-red-700 font-medium px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">Limpar filtros</button></div>}
            </div>
          )}
        </div>
        <div>
          {filtered.length === 0 ? <EmptyState icon="✅" title={tasks.length === 0 ? "Nenhuma tarefa ainda" : "Nenhuma tarefa encontrada"} sub={tasks.length === 0 ? "Clique em \"+ Nova Tarefa\" para criar sua primeira tarefa." : "Tente ajustar a busca ou os filtros."} /> :
            filtered.map((task, i) => (
              <div key={task.id} className={`flex items-start gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group ${i < filtered.length - 1 ? "border-b border-gray-100 dark:border-gray-800" : ""}`}>
                <div className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 cursor-pointer ${task.status === "Concluída" ? "bg-green-500" : task.status === "Em andamento" ? "bg-blue-500" : task.status === "Atrasada" ? "bg-red-400" : "bg-gray-300"}`}
                  onClick={() => { const ns: TaskStatus = task.status === "Concluída" ? "A fazer" : "Concluída"; const nt = tasks.map(t => t.id === task.id ? { ...t, status: ns } : t); setTasks(nt); setGoals(goals.map(g => ({ ...g, progress: calcGoalProgress(g, nt) }))); }} />
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setEditTask(task)}>
                  <p className={`text-sm font-medium ${task.status === "Concluída" ? "line-through text-gray-400" : "text-gray-900 dark:text-gray-100"}`}>{task.name}</p>
                  {task.description && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{task.description}</p>}
                  <div className="flex flex-wrap gap-1 mt-1.5">{task.tags.map(t => <TagBadge key={t} t={t} />)}{task.goalId && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400">◎ {goals.find(g => g.id === task.goalId)?.name}</span>}</div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0"><PriorityBadge p={task.priority} /><StatusBadge s={task.status} />{task.dueDate && <span className="text-xs text-gray-400 dark:text-gray-500">{task.dueDate}</span>}<button onClick={e => { e.stopPropagation(); setFocusTask(task); }} className="opacity-0 group-hover:opacity-100 text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded-lg transition-all">▶</button><button onClick={() => setTaskToDelete(task)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition-all text-sm leading-none">✕</button></div>
              </div>
            ))
          }
        </div>
      </div>
      {showModal && <TaskModal projects={projects} goals={goals} onClose={() => setShowModal(false)} onSave={t => { const nt = { ...t, id: Date.now(), status: t.status || "A fazer" } as Task; const newTasks = [...tasks, nt]; setTasks(newTasks); if (t.goalId) setGoals(goals.map(g => g.id === t.goalId ? { ...g, taskIds: [...g.taskIds, nt.id], progress: calcGoalProgress({ ...g, taskIds: [...g.taskIds, nt.id] }, newTasks) } : g)); }} />}
      {editTask && <TaskModal initial={editTask} projects={projects} goals={goals} onClose={() => setEditTask(null)} onSave={handleEdit} />}
      {focusTask && <FocusModal task={focusTask} onClose={() => setFocusTask(null)} />}
      {taskToDelete && (
        <Overlay onClose={() => setTaskToDelete(null)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-delete-title" aria-describedby="confirm-delete-description" className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="w-11 h-11 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-red-600 dark:text-red-400 text-xl mb-4">!</div>
            <h2 id="confirm-delete-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">Excluir tarefa?</h2>
            <p id="confirm-delete-description" className="text-sm text-gray-500 dark:text-gray-400 mt-2 break-words">
              Tem certeza de que deseja excluir <strong className="text-gray-800 dark:text-gray-200">{taskToDelete.name}</strong>? Esta ação não poderá ser desfeita.
            </p>
            <div className="flex gap-3 mt-6">
              <button type="button" autoFocus onClick={() => setTaskToDelete(null)} className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancelar</button>
              <button type="button" onClick={() => { handleDelete(taskToDelete.id); setTaskToDelete(null); }} className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">Sim, excluir tarefa</button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ─── Projects Page ────────────────────────────────────────────────────────────
function ProjectsPage({ onNav }: { onNav: (s: Screen) => void }) {
  const { data, setProjects, setTasks } = useData();
  const { projects, tasks, goals } = data;
  const [showNew, setShowNew] = useState(false); const [newName, setNewName] = useState(""); const [newDesc, setNewDesc] = useState("");
  const [detail, setDetail] = useState<Project | null>(null); const [editing, setEditing] = useState<Project | null>(null);
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const [editTask, setEditTask] = useState<Task | { id: 0; project: string; projectId: number } | null>(null);
  const linkedGoals = (proj: Project) => goals.filter(g => (g.projectIds || []).includes(proj.id));
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6"><h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Projetos</h1><button onClick={() => setShowNew(true)} className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">+ Novo Projeto</button></div>
      {projects.length === 0 ? <EmptyState icon="◫" title="Nenhum projeto ainda" sub="Crie um projeto para organizar suas tarefas ou use um modelo." /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {projects.map(p => { const s = calcProjectProgress(p, tasks); const lg = linkedGoals(p); return (
            <button key={p.id} onClick={() => { setDetail(p); setEditing(null); }} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 text-left hover:shadow-sm hover:border-green-200 dark:hover:border-green-700 transition-all">
              <div className="flex items-start justify-between mb-3"><div><h3 className="font-semibold text-gray-900 dark:text-gray-100">{p.name}</h3><p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{p.description}</p></div><span className="text-xs font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-lg">{s.progress}%</span></div>
              <div className="mb-3"><div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden"><div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${s.progress}%` }} /></div></div>
              <p className="text-xs text-gray-400 dark:text-gray-500">{s.done} de {s.total} tarefas concluídas</p>
              {lg.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{lg.map(g => <span key={g.id} className="text-xs px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400">◎ {g.name}</span>)}</div>}
            </button>
          ); })}
        </div>
      )}
      {detail && !editing && (
        <Overlay onClose={() => setDetail(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-1"><h2 className="font-semibold text-gray-900 dark:text-gray-100 text-lg pr-4">{detail.name}</h2><button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none flex-shrink-0">×</button></div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{detail.description}</p>
            {(() => { const s = calcProjectProgress(detail, tasks); return <div className="mb-5"><div className="flex items-center justify-between mb-1.5"><span className="text-xs text-gray-400 dark:text-gray-500">Progresso</span><span className="text-xs font-bold text-green-600 dark:text-green-400">{s.progress}%</span></div><div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden"><div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${s.progress}%` }} /></div><p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{s.done} de {s.total} tarefas concluídas</p></div>; })()}
            {linkedGoals(detail).length > 0 && <div className="mb-5"><p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Metas vinculadas</p><div className="flex flex-wrap gap-2">{linkedGoals(detail).map(g => <button key={g.id} onClick={() => { setDetail(null); onNav("goals"); }} className="text-xs px-3 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors font-medium">◎ {g.name} — {calcGoalProgress(g, tasks)}%</button>)}</div></div>}
            <div className="flex gap-3 mb-6"><button onClick={() => setEditing({ ...detail })} className="flex-1 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg py-2 text-sm font-medium transition-colors">Editar</button><button onClick={() => setConfirmDel(detail.id)} className="flex-1 border border-red-200 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg py-2 text-sm font-medium transition-colors">Excluir</button></div>
            <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
              <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Tarefas do projeto</h3>
              <div className="space-y-2">
                {tasks.filter(t => t.projectId === detail.id).length === 0 ? <p className="text-sm text-gray-400 dark:text-gray-500 py-2">Nenhuma tarefa neste projeto.</p> : tasks.filter(t => t.projectId === detail.id).map(task => (
                  <div key={task.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800" onClick={() => setEditTask(task)}>
                    <div className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${task.status === "Concluída" ? "bg-green-500" : task.status === "Em andamento" ? "bg-blue-500" : task.status === "Atrasada" ? "bg-red-400" : "bg-gray-300"}`} />
                    <div className="flex-1 min-w-0"><p className={`text-sm font-medium ${task.status === "Concluída" ? "line-through text-gray-400" : "text-gray-800 dark:text-gray-200"}`}>{task.name}</p><div className="flex flex-wrap gap-1 mt-1"><PriorityBadge p={task.priority} /><StatusBadge s={task.status} /></div></div>
                  </div>
                ))}
              </div>
              <button onClick={() => setEditTask({ id: 0, project: detail.name, projectId: detail.id })} className="mt-3 w-full border border-dashed border-green-300 dark:border-green-700 text-green-600 dark:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg py-2 text-sm font-medium transition-colors">+ Nova Tarefa no Projeto</button>
            </div>
          </div>
        </Overlay>
      )}
      {editing && (
        <Overlay onClose={() => setEditing(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-5">Editar Projeto</h2>
            <div className="space-y-4">
              <div><label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 block">Nome</label><input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200" /></div>
              <div><label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 block">Descrição</label><textarea value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} rows={2} className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200 resize-none" /></div>
            </div>
            <div className="flex gap-3 mt-6"><button onClick={() => setEditing(null)} className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">Cancelar</button><button onClick={() => { const u = editing!; setProjects(projects.map(p => p.id === u.id ? u : p)); setDetail(u); setEditing(null); }} className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-lg py-2 text-sm font-medium transition-colors">Salvar</button></div>
          </div>
        </Overlay>
      )}
      {editTask && (
        <TaskModal initial={"id" in editTask && editTask.id === 0 ? { project: editTask.project, projectId: editTask.projectId } : editTask as Task} projects={projects} goals={goals}
          onClose={() => setEditTask(null)}
          onSave={updated => { if ("id" in editTask && editTask.id === 0) { setTasks([...tasks, { ...updated, id: Date.now(), status: "A fazer" } as Task]); } else { setTasks(tasks.map(t => t.id === (editTask as Task).id ? { ...t, ...updated } : t)); } setEditTask(null); }} />
      )}
      {confirmDel !== null && (
        <Overlay onClose={() => setConfirmDel(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6"><p className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Excluir projeto?</p><p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Esta ação não pode ser desfeita.</p><div className="flex gap-3"><button onClick={() => setConfirmDel(null)} className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">Cancelar</button><button onClick={() => { setProjects(projects.filter(p => p.id !== confirmDel)); setConfirmDel(null); setDetail(null); }} className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-lg py-2 text-sm font-medium transition-colors">Confirmar</button></div></div>
        </Overlay>
      )}
      {showNew && (
        <Overlay onClose={() => setShowNew(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-5">Novo Projeto</h2>
            <div className="space-y-4">
              <div><label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 block">Nome do projeto</label><input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: Lançamento do Produto" className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200" /></div>
              <div><label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 block">Descrição</label><textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={2} className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200 resize-none" /></div>
            </div>
            <div className="flex gap-3 mt-6"><button onClick={() => setShowNew(false)} className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">Cancelar</button><button disabled={!newName.trim()} onClick={() => { setProjects([...projects, { id: Date.now(), name: newName, description: newDesc, progress: 0, done: 0, total: 0 }]); setShowNew(false); setNewName(""); setNewDesc(""); }} className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium transition-colors">Criar Projeto</button></div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ─── Goals Page ───────────────────────────────────────────────────────────────
function GoalFormModal({ title, initial, projects, tasks, onClose, onSave }: {
  title: string;
  initial: { name: string; description: string; dueDate: string; projectIds: number[]; taskIds: number[] };
  projects: Project[];
  tasks: Task[];
  onClose: () => void;
  onSave: (data: { name: string; description: string; dueDate: string; projectIds: number[]; taskIds: number[] }) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [desc, setDesc] = useState(initial.description);
  const [date, setDate] = useState(initial.dueDate);
  const [projIds, setProjIds] = useState<number[]>(initial.projectIds);
  const [taskIds, setTaskIds] = useState<number[]>(initial.taskIds);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const toggleProj = (id: number) => setProjIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  const toggleTaskLink = (id: number) => setTaskIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  const unlinkedTasks = tasks.filter(t => !taskIds.includes(t.id));
  return (
    <Overlay onClose={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-5">{title}</h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 block">Nome *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Aprovação no TCC"
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 block">Descrição</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="Breve descrição da meta"
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-200 resize-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 block">Prazo</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-200" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">Projetos vinculados</label>
            {projects.filter(p => projIds.includes(p.id)).length > 0 ? (
              <div className="space-y-1.5 mb-2">
                {projects.filter(p => projIds.includes(p.id)).map(p => (
                  <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30">
                    <span className="flex-1 text-sm text-gray-800 dark:text-gray-200">◫ {p.name}</span>
                    <button type="button" aria-label={`Desvincular projeto ${p.name}`} title="Desvincular projeto (não exclui o projeto)" onClick={() => toggleProj(p.id)} className="text-sm text-gray-400 hover:text-red-500 transition-colors ml-1">✕</button>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-gray-400 mb-2">Nenhum projeto vinculado.</p>}
            {projects.some(p => !projIds.includes(p.id)) && (
              !showProjectModal ? (
                <button type="button" onClick={() => setShowProjectModal(true)} className="w-full border border-dashed border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg py-2 text-sm font-medium transition-colors">
                  + Vincular projeto existente
                </button>
              ) : (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="p-2 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Selecionar projetos</span>
                    <button type="button" onClick={() => setShowProjectModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm">×</button>
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    {projects.filter(p => !projIds.includes(p.id)).map(p => (
                      <button key={p.id} type="button" onClick={() => toggleProj(p.id)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 text-left transition-colors border-b border-gray-50 dark:border-gray-800 last:border-0">
                        <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">◫ {p.name}</span>
                        <span className="text-blue-600 text-xs">Vincular</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            )}
            <p className="text-xs text-gray-400 mt-2">Clique em Salvar alterações para gravar os vínculos. Desvincular não exclui o projeto.</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">Tarefas vinculadas</label>
            {taskIds.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {tasks.filter(t => taskIds.includes(t.id)).map(t => (
                  <div key={t.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-900/30">
                    <span className="flex-1 text-sm text-gray-800 dark:text-gray-200">{t.name}</span>
                    <PriorityBadge p={t.priority} />
                    <button onClick={() => toggleTaskLink(t.id)} className="text-xs text-gray-400 hover:text-red-500 transition-colors ml-1">✕</button>
                  </div>
                ))}
              </div>
            )}
            {unlinkedTasks.length > 0 && (
              <div>
                {!showTaskModal ? (
                  <button onClick={() => setShowTaskModal(true)}
                    className="w-full border border-dashed border-purple-300 dark:border-purple-700 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg py-2 text-sm font-medium transition-colors">
                    + Vincular tarefa existente
                  </button>
                ) : (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="p-2 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Selecionar tarefas</span>
                      <button onClick={() => setShowTaskModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm">×</button>
                    </div>
                    <div className="max-h-40 overflow-y-auto">
                      {unlinkedTasks.map(t => (
                        <button key={t.id} onClick={() => toggleTaskLink(t.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 text-left transition-colors border-b border-gray-50 dark:border-gray-800 last:border-0">
                          <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{t.name}</span>
                          <PriorityBadge p={t.priority} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">Cancelar</button>
          <button disabled={!name.trim()} onClick={() => { if (!name.trim()) return; onSave({ name, description: desc, dueDate: date, projectIds: projIds, taskIds }); }}
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium transition-colors">
            {title === "Nova Meta" ? "Criar Meta" : "Salvar alterações"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function GoalsPage() {
  const { data, setGoals, setTasks } = useData();
  const { goals, tasks, projects } = data;
  const [showNew, setShowNew] = useState(false);
  const [detail, setDetail] = useState<Goal | null>(null);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const [taskModal, setTaskModal] = useState<Task | "new" | null>(null);
  const [unlinkTask, setUnlinkTask] = useState<number | null>(null);

  const [goalError, setGoalError] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);
  const goalTasks = (g: Goal) => tasks.filter(t => g.taskIds.includes(t.id));
  const rebuildGoals = (updatedGoals: Goal[], updatedTasks: Task[]) =>
    updatedGoals.map(g => ({ ...g, progress: calcGoalProgress(g, updatedTasks) }));

  const showGoalError = (error: unknown) => {
    setGoalError(error instanceof Error ? error.message : "Não foi possível salvar a alteração.");
    console.error("Erro na API de metas:", error);
    window.alert(error instanceof Error ? error.message : "Não foi possível salvar a alteração.");
  };

  const persistGoal = async (goal: Goal, next: Goal, updatedTasks: Task[] = tasks) => {
    const resposta = await atualizarMeta(goal.id, goalParaPayload(next));
    if (!resposta.data) throw new Error("A API não retornou a meta atualizada.");
    const saved = metaApiParaGoal(resposta.data, updatedTasks);
    const nextGoals = rebuildGoals(goals.map(g => g.id === goal.id ? saved : g), updatedTasks);
    setGoals(nextGoals);
    setDetail(saved);
    return saved;
  };

  const toggleTask = async (taskId: number) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const status: TaskStatus = task.status === "Concluída" ? "A fazer" : "Concluída";
    const updated = { ...task, status };
    setGoalError("");
    try {
      const resposta = await atualizarTarefa(taskId, taskParaPayload(updated));
      if (!resposta.data) throw new Error("A API não retornou a tarefa atualizada.");
      const savedTask = { ...task, ...tarefaApiParaTask(resposta.data) };
      const newTasks = tasks.map(t => t.id === taskId ? savedTask : t);
      // A alteração já foi gravada; atualizamos apenas a interface.
      setTasks(newTasks);
      const newGoals = rebuildGoals(goals, newTasks);
      setGoals(newGoals);
      if (detail) setDetail(newGoals.find(g => g.id === detail.id) || null);
    } catch (error) { showGoalError(error); }
  };

  const unlinkGoalTask = async (taskId: number) => {
    if (!detail) return;
    setGoalError("");
    try {
      await persistGoal(detail, { ...detail, taskIds: detail.taskIds.filter(id => id !== taskId) });
      setUnlinkTask(null);
    } catch (error) { showGoalError(error); }
  };

  const handleTaskSave = async (updated: Partial<Task>) => {
    if (!detail) return;
    setGoalError("");
    try {
      if (taskModal === "new") {
        const draft: Task = { id: 0, name: updated.name || "", description: updated.description || "", priority: updated.priority || "Média", status: updated.status || "A fazer", tags: updated.tags || [], dueDate: updated.dueDate || "", project: updated.project || "", projectId: updated.projectId ?? null, goalId: detail.id };
        const resposta = await criarTarefa(taskParaPayload(draft));
        if (!resposta.data) throw new Error("A API não retornou a nova tarefa.");
        const savedTask = tarefaApiParaTask(resposta.data);
        const nextGoal = { ...detail, taskIds: [...detail.taskIds, savedTask.id] };
        try {
          await persistGoal(detail, nextGoal, [...tasks, savedTask]);
        } catch (error) {
          // A tarefa foi criada, mas a associação falhou: sincronizar a lista para não perder o registro.
          setTasks([...tasks, savedTask]);
          throw error;
        }
        setTasks([...tasks, savedTask]);
      } else if (taskModal && typeof taskModal !== "string") {
        const oldTask = taskModal as Task;
        const draft = { ...oldTask, ...updated };
        const resposta = await atualizarTarefa(oldTask.id, taskParaPayload(draft));
        if (!resposta.data) throw new Error("A API não retornou a tarefa atualizada.");
        const savedTask = { ...oldTask, ...tarefaApiParaTask(resposta.data) };
        const newTasks = tasks.map(t => t.id === oldTask.id ? savedTask : t);
        setTasks(newTasks);
        const newGoals = rebuildGoals(goals, newTasks);
        setGoals(newGoals);
        setDetail(newGoals.find(g => g.id === detail.id) || null);
      }
      setTaskModal(null);
    } catch (error) { showGoalError(error); }
  };

  const handleSaveGoal = async (g: Goal, data: { name: string; description: string; dueDate: string; projectIds: number[]; taskIds: number[] }) => {
    if (savingGoal) return;
    setSavingGoal(true);
    setGoalError("");
    try {
      await persistGoal(g, { ...g, ...data });
      setEditing(null);
    } catch (error) { showGoalError(error); }
    finally { setSavingGoal(false); }
  };

  const handleCreateGoal = async (data: { name: string; description: string; dueDate: string; projectIds: number[]; taskIds: number[] }) => {
    if (savingGoal) return;
    setSavingGoal(true);
    setGoalError("");
    try {
      const draft: Goal = { id: 0, ...data, progress: 0 };
      const resposta = await criarMeta(goalParaPayload(draft));
      if (!resposta.data) throw new Error("A API não retornou a meta criada.");
      const saved = metaApiParaGoal(resposta.data, tasks);
      setGoals([...goals, saved]);
      setShowNew(false);
    } catch (error) { showGoalError(error); }
    finally { setSavingGoal(false); }
  };

  const handleToggleGoalCompletion = async () => {
    if (!detail || savingGoal) return;
    setSavingGoal(true);
    setGoalError("");
    try {
      await persistGoal(detail, {
        ...detail,
        concluida: Number(detail.concluida) === 1 ? 0 : 1,
      });
    } catch (error) {
      showGoalError(error);
    } finally {
      setSavingGoal(false);
    }
  };

  const handleDeleteGoal = async (goalId: number) => {
    if (savingGoal) return;
    setSavingGoal(true);
    setGoalError("");
    try {
      await excluirMeta(goalId);
      setGoals(goals.filter(g => g.id !== goalId));
      setConfirmDel(null);
      setDetail(null);
    } catch (error) { showGoalError(error); }
    finally { setSavingGoal(false); }
  };

  const linkExistingTask = async (taskId: number) => {
    if (!detail || detail.taskIds.includes(taskId)) return;
    setGoalError("");
    try {
      await persistGoal(detail, { ...detail, taskIds: [...detail.taskIds, taskId] });
    } catch (error) { showGoalError(error); }
  };

  const linkedTasksInDetail = detail ? goalTasks(detail) : [];
  const unlinkedTasksForDetail = detail ? tasks.filter(t => !detail.taskIds.includes(t.id)) : [];

  const formatDate = (d: string) => {
    if (!d) return "Sem prazo definido";
    const [y, m, day] = d.split("-");
    return `até ${day}/${m}/${y}`;
  };

  return (
    <div className="p-6 md:p-8">
      {goalError && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {goalError}
          <button onClick={() => setGoalError("")} className="ml-3 font-bold">×</button>
        </div>
      )}
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Metas</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Conecte seus grandes objetivos às ações do dia a dia.</p>
        </div>
        <button onClick={() => setShowNew(true)} className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5 flex-shrink-0 ml-4">
          <span>+</span> Nova Meta
        </button>
      </div>

      <div className="mt-6">
        {goals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 bg-purple-50 dark:bg-purple-900/20 rounded-2xl flex items-center justify-center text-2xl mb-4">◎</div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Você ainda não possui nenhuma meta</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 max-w-xs mb-5">Crie uma meta para conectar seus objetivos às tarefas do dia a dia.</p>
            <button onClick={() => setShowNew(true)} className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">+ Criar primeira meta</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {goals.map(g => {
              const progress = calcGoalProgress(g, tasks);
              const ts = goalTasks(g);
              const lp = (g.projectIds || []).map(id => projects.find(p => p.id === id)).filter(Boolean) as Project[];
              const previewTasks = ts.slice(0, 4);
              return (
                <button key={g.id} onClick={() => { setDetail(g); setEditing(null); }}
                  className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 text-left hover:shadow-md hover:border-purple-200 dark:hover:border-purple-800 transition-all group">
                  {/* Title row */}
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center text-sm flex-shrink-0">◎</div>
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 leading-tight">{g.name}</h3>
                    </div>
                    <span className="text-xs font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-2 py-1 rounded-lg ml-3 flex-shrink-0">{progress}%</span>
                  </div>
                  {/* Description */}
                  {g.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-3 leading-relaxed line-clamp-2 ml-9">{g.description}</p>}
                  {/* Progress bar */}
                  <div className="mb-3 ml-9">
                    <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                  {/* Projects */}
                  {lp.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3 ml-9">
                      {lp.map(p => <span key={p.id} className="text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">◫ {p.name}</span>)}
                    </div>
                  )}
                  {/* Tasks preview */}
                  {previewTasks.length > 0 && (
                    <div className="space-y-1 ml-9 mb-3">
                      {previewTasks.map(t => (
                        <div key={t.id} className="flex items-center gap-2">
                          <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${t.status === "Concluída" ? "bg-green-500 border-green-500" : "border-gray-300 dark:border-gray-600"}`}>
                            {t.status === "Concluída" && <span className="text-white text-[8px] leading-none font-bold">✓</span>}
                          </div>
                          <span className={`text-xs flex-1 truncate ${t.status === "Concluída" ? "line-through text-gray-400 dark:text-gray-500" : "text-gray-700 dark:text-gray-300"}`}>{t.name}</span>
                          {t.priority === "Alta" && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 dark:bg-red-900/20 text-red-500 flex-shrink-0">Alta</span>}
                        </div>
                      ))}
                      {ts.length > 4 && <p className="text-xs text-gray-400 dark:text-gray-500 ml-5">+{ts.length - 4} tarefas</p>}
                    </div>
                  )}
                  {/* Footer */}
                  <div className="ml-9 mt-auto">
                    <span className="text-xs text-gray-400 dark:text-gray-500">{formatDate(g.dueDate)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detail && !editing && (
        <Overlay onClose={() => { setDetail(null); setTaskModal(null); }}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-purple-50 dark:bg-purple-900/20 rounded-xl flex items-center justify-center text-lg flex-shrink-0">◎</div>
                <div>
                  <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-lg leading-tight">{detail.name}</h2>
                  {detail.dueDate && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{formatDate(detail.dueDate)}</p>}
                </div>
              </div>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none flex-shrink-0 ml-3">×</button>
            </div>
            {detail.description && <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">{detail.description}</p>}

            {/* Progress */}
            {(() => {
              const progress = calcGoalProgress(detail, tasks);
              const ts = goalTasks(detail);
              return (
                <div className="mb-5 bg-purple-50 dark:bg-purple-900/10 rounded-xl p-4 border border-purple-100 dark:border-purple-900/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{ts.filter(t => t.status === "Concluída").length} de {ts.length} tarefas concluídas</span>
                    <span className="text-sm font-bold text-purple-600 dark:text-purple-400">{progress}%</span>
                  </div>
                  <div className="w-full h-2 bg-purple-100 dark:bg-purple-900/30 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              );
            })()}

            {/* Projetos vinculados: apenas associações confirmadas pela API */}
            <div className="mb-5">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Projetos vinculados</p>
              {(() => {
                const linkedProjects = (detail.projectIds || [])
                  .map(id => projects.find(p => p.id === id))
                  .filter((p): p is Project => Boolean(p));
                return linkedProjects.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {linkedProjects.map(p => (
                      <span key={p.id} className="text-xs px-3 py-1.5 rounded-lg font-medium border border-blue-400 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400">
                        ✓ ◫ {p.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 dark:text-gray-500">Nenhum projeto vinculado. Use Editar para vincular um projeto.</p>
                );
              })()}
            </div>

            {/* Actions */}
            <div className="mb-3">
              <button
                type="button"
                disabled={savingGoal}
                onClick={() => void handleToggleGoalCompletion()}
                className={`w-full rounded-lg py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${Number(detail.concluida) === 1
                  ? "border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800"
                  : "bg-green-600 hover:bg-green-700 text-white"
                }`}
              >
                {savingGoal ? "Salvando..." : Number(detail.concluida) === 1 ? "↶ Reabrir meta" : "✓ Concluir meta"}
              </button>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
                {Number(detail.concluida) === 1 ? "Meta marcada como concluída." : "Meta ainda não concluída."} O progresso das tarefas é independente.
              </p>
            </div>
            <div className="flex gap-3 mb-5">
              <button onClick={() => setEditing({ ...detail })} className="flex-1 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg py-2 text-sm font-medium transition-colors">Editar</button>
              <button onClick={() => setConfirmDel(detail.id)} className="flex-1 border border-red-200 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg py-2 text-sm font-medium transition-colors">Excluir</button>
            </div>

            {/* Tasks */}
            <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
              <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Tarefas vinculadas</h3>
              <div className="space-y-1.5">
                {linkedTasksInDetail.length === 0 && <p className="text-sm text-gray-400 dark:text-gray-500 py-2">Nenhuma tarefa vinculada.</p>}
                {linkedTasksInDetail.map(t => (
                  <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 group transition-colors">
                    <button onClick={() => toggleTask(t.id)}
                      className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${t.status === "Concluída" ? "bg-green-500 border-green-500 text-white" : "border-gray-300 dark:border-gray-600 hover:border-green-400"}`}>
                      {t.status === "Concluída" && <span className="text-[9px] leading-none font-bold">✓</span>}
                    </button>
                    <span className={`flex-1 text-sm ${t.status === "Concluída" ? "line-through text-gray-400 dark:text-gray-500" : "text-gray-800 dark:text-gray-200"}`}>{t.name}</span>
                    <PriorityBadge p={t.priority} />
                    {t.dueDate && <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">{t.dueDate}</span>}
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setTaskModal(t)} className="text-xs text-gray-400 hover:text-green-600 dark:hover:text-green-400 px-1 py-0.5 rounded transition-colors">✎</button>
                      <button onClick={() => setUnlinkTask(t.id)} className="text-xs text-gray-400 hover:text-red-500 px-1 py-0.5 rounded transition-colors">✕</button>
                    </div>
                  </div>
                ))}
              </div>
              {/* Link existing task inline */}
              {unlinkedTasksForDetail.length > 0 && (
                <details className="mt-2 group/details">
                  <summary className="cursor-pointer text-xs text-purple-600 dark:text-purple-400 font-medium hover:text-purple-700 list-none py-1 select-none">
                    + Vincular tarefa existente
                  </summary>
                  <div className="mt-1.5 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden max-h-36 overflow-y-auto">
                    {unlinkedTasksForDetail.map(t => (
                      <button key={t.id} onClick={() => void linkExistingTask(t.id)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 text-left transition-colors border-b border-gray-50 dark:border-gray-800 last:border-0">
                        <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{t.name}</span>
                        <PriorityBadge p={t.priority} />
                      </button>
                    ))}
                  </div>
                </details>
              )}
              <button onClick={() => setTaskModal("new")} className="mt-2 w-full border border-dashed border-green-300 dark:border-green-700 text-green-600 dark:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg py-2 text-sm font-medium transition-colors">+ Nova Tarefa Vinculada</button>
            </div>
          </div>
        </Overlay>
      )}

      {taskModal && detail && (
        <TaskModal initial={taskModal === "new" ? { goalId: detail.id } : taskModal} projects={projects} onClose={() => setTaskModal(null)} onSave={handleTaskSave} />
      )}

      {/* Edit Modal */}
      {editing && (
        <GoalFormModal
          title="Editar Meta"
          initial={{ name: editing.name, description: editing.description, dueDate: editing.dueDate, projectIds: editing.projectIds || [], taskIds: editing.taskIds }}
          projects={projects}
          tasks={tasks}
          onClose={() => setEditing(null)}
          onSave={data => handleSaveGoal(editing, data)}
        />
      )}

      {/* New Meta Modal */}
      {showNew && (
        <GoalFormModal
          title="Nova Meta"
          initial={{ name: "", description: "", dueDate: "", projectIds: [], taskIds: [] }}
          projects={projects}
          tasks={tasks}
          onClose={() => setShowNew(false)}
          onSave={handleCreateGoal}
        />
      )}

      {/* Confirm unlink task */}
      {unlinkTask !== null && (
        <Overlay onClose={() => setUnlinkTask(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <p className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Desvincular tarefa?</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">A tarefa continuará existindo no sistema — apenas o vínculo com esta meta será removido.</p>
            <div className="flex gap-3">
              <button onClick={() => setUnlinkTask(null)} className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">Cancelar</button>
              <button onClick={() => unlinkGoalTask(unlinkTask)} className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-lg py-2 text-sm font-medium transition-colors">Desvincular</button>
            </div>
          </div>
        </Overlay>
      )}

      {/* Confirm delete goal */}
      {confirmDel !== null && (
        <Overlay onClose={() => setConfirmDel(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <p className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Excluir esta meta?</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">As tarefas e projetos vinculados <strong>não serão excluídos</strong> — apenas o vínculo com esta meta será removido.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDel(null)} className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">Cancelar</button>
              <button onClick={() => handleDeleteGoal(confirmDel)} className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-lg py-2 text-sm font-medium transition-colors">Confirmar</button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ─── Reports (dados reais) ────────────────────────────────────────────────────
function ReportsPage() {
  const { data } = useData();
  const { tasks, projects, goals } = data;
  const [tab, setTab] = useState<"Relatórios" | "Legado">("Relatórios");
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  // O backend não fornece a data histórica de conclusão. O filtro usa o prazo
  // cadastrado, sem apresentar esse recorte como produtividade realizada no período.
  const today = new Date();
  const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const endDate = localDate(today);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (period - 1));
  const startDate = localDate(start);
  const periodTasks = tasks.filter(t => t.dueDate && t.dueDate >= startDate && t.dueDate <= endDate);
  const total = periodTasks.length;
  const completed = periodTasks.filter(t => t.status === "Concluída").length;
  const rate = total > 0 ? Math.round(completed / total * 100) : 0;
  const avgGoalProgress = goals.length > 0 ? Math.round(goals.reduce((a, g) => a + calcGoalProgress(g, tasks), 0) / goals.length) : 0;
  const avgProjectProgress = projects.length > 0 ? Math.round(projects.reduce((a, p) => a + calcProjectProgress(p, tasks).progress, 0) / projects.length) : 0;
  const statusCategories: { name: string; value: number; color: string }[] = [
    { name: "Concluídas", value: periodTasks.filter(t => t.status === "Concluída").length, color: "#16a34a" },
    { name: "Em andamento", value: periodTasks.filter(t => t.status === "Em andamento").length, color: "#2563eb" },
    { name: "A fazer", value: periodTasks.filter(t => t.status === "A fazer").length, color: "#6b7280" },
    { name: "Atrasadas", value: periodTasks.filter(t => t.status === "Atrasada").length, color: "#dc2626" },
  ];
  const statusCounts = statusCategories.filter(d => d.value > 0);
  const periodData = Array.from({ length: period }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const str = localDate(d);
    return { day: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      "Pendentes": periodTasks.filter(t => t.dueDate === str && t.status !== "Concluída").length,
      "Concluídas": periodTasks.filter(t => t.dueDate === str && t.status === "Concluída").length };
  });
  const hasPeriodData = periodData.some(d => d.Pendentes > 0 || d["Concluídas"] > 0);
  const goalProgressData = goals.map(g => ({ name: g.name.length > 22 ? g.name.slice(0, 22) + "…" : g.name, progress: calcGoalProgress(g, tasks) }));
  // Legado data
  const completedTasks = tasks.filter(t => t.status === "Concluída");
  const completedProjects = projects.filter(p => { const s = calcProjectProgress(p, tasks); return s.progress === 100 && s.total > 0; });
  const completedGoals = goals.filter(g => calcGoalProgress(g, tasks) === 100 && g.taskIds.length > 0);
  const totalFocusMin = data.focusSessions.reduce((a, s) => a + s.duration, 0);
  const totalFocusSessions = data.focusSessions.length;
  const activeDays = new Set([...completedTasks.map(t => t.completedAt || t.dueDate).filter(Boolean), ...data.focusSessions.map(s => s.date)]).size;
  const currentYear = new Date().getFullYear();
  const yearTasks = completedTasks.filter(t => (t.completedAt || t.dueDate || "").startsWith(String(currentYear)));
  const yearSessions = data.focusSessions.filter(s => s.date.startsWith(String(currentYear)));
  const yearFocusMin = yearSessions.reduce((a, s) => a + s.duration, 0);

  return (
    <div className="p-8">
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex-1">Relatórios</h1>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          {(["Relatórios", "Legado"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}>{t}</button>
          ))}
        </div>
      </div>

      {tab === "Legado" && (
        <div>
          {completedTasks.length === 0 && totalFocusSessions === 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-16 text-center">
              <div className="w-14 h-14 bg-purple-50 dark:bg-purple-900/20 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-4">🏛</div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Seu legado começa aqui.</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 max-w-xs mx-auto">Conclua tarefas, projetos e metas para construir sua trajetória no Organix.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { label: "Tarefas concluídas", value: completedTasks.length, icon: "✓", color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/20" },
                  { label: "Projetos concluídos", value: completedProjects.length, icon: "◫", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/20" },
                  { label: "Metas alcançadas", value: completedGoals.length, icon: "◎", color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-900/20" },
                  { label: "Sessões de foco", value: totalFocusSessions, icon: "⏱", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/20" },
                  { label: "Tempo de foco", value: totalFocusMin >= 60 ? `${Math.floor(totalFocusMin / 60)}h ${totalFocusMin % 60}min` : `${totalFocusMin}min`, icon: "🎯", color: "text-gray-700 dark:text-gray-300", bg: "bg-gray-100 dark:bg-gray-800" },
                  { label: "Dias ativos", value: activeDays, icon: "📅", color: "text-gray-700 dark:text-gray-300", bg: "bg-gray-100 dark:bg-gray-800" },
                ].map(c => (
                  <div key={c.label} className={`${c.bg} rounded-2xl p-4`}>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{c.label}</p>
                    <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
                  </div>
                ))}
              </div>
              {/* Year timeline */}
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Legado {currentYear}</h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Sua trajetória neste ano</p>
                {yearTasks.length === 0 && yearSessions.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">Nenhum dado registrado em {currentYear} ainda.</p>
                ) : (
                  <div className="space-y-3">
                    {yearTasks.length > 0 && (
                      <div className="flex items-start gap-3">
                        <span className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-xs text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5">✓</span>
                        <p className="text-sm text-gray-700 dark:text-gray-300"><strong>{yearTasks.length}</strong> tarefa{yearTasks.length !== 1 ? "s" : ""} concluída{yearTasks.length !== 1 ? "s" : ""}</p>
                      </div>
                    )}
                    {completedProjects.length > 0 && (
                      <div className="flex items-start gap-3">
                        <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-xs text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5">◫</span>
                        <p className="text-sm text-gray-700 dark:text-gray-300"><strong>{completedProjects.length}</strong> projeto{completedProjects.length !== 1 ? "s" : ""} concluído{completedProjects.length !== 1 ? "s" : ""}: {completedProjects.map(p => p.name).join(", ")}</p>
                      </div>
                    )}
                    {completedGoals.length > 0 && (
                      <div className="flex items-start gap-3">
                        <span className="w-5 h-5 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center text-xs text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5">◎</span>
                        <p className="text-sm text-gray-700 dark:text-gray-300"><strong>{completedGoals.length}</strong> meta{completedGoals.length !== 1 ? "s" : ""} alcançada{completedGoals.length !== 1 ? "s" : ""}: {completedGoals.map(g => g.name).join(", ")}</p>
                      </div>
                    )}
                    {yearSessions.length > 0 && (
                      <div className="flex items-start gap-3">
                        <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-xs text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5">⏱</span>
                        <p className="text-sm text-gray-700 dark:text-gray-300"><strong>{yearSessions.length}</strong> sessão{yearSessions.length !== 1 ? "ões" : ""} de foco · <strong>{yearFocusMin >= 60 ? `${Math.floor(yearFocusMin / 60)}h ${yearFocusMin % 60}min` : `${yearFocusMin}min`}</strong> de concentração</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* Focus by project */}
              {data.focusSessions.length > 0 && projects.length > 0 && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                  <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Foco por Projeto</h2>
                  <div className="space-y-3">
                    {projects.map(p => {
                      const projTaskIds = tasks.filter(t => t.project === p.name).map(t => t.id);
                      const projMin = data.focusSessions.filter(s => projTaskIds.includes(s.taskId)).reduce((a, s) => a + s.duration, 0);
                      if (projMin === 0) return null;
                      return (
                        <div key={p.id}><div className="flex items-center justify-between mb-1"><span className="text-sm text-gray-700 dark:text-gray-300">{p.name}</span><span className="text-xs text-gray-400 dark:text-gray-500">{projMin >= 60 ? `${Math.floor(projMin / 60)}h ${projMin % 60}min` : `${projMin}min`}</span></div><div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden"><div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(100, (projMin / totalFocusMin) * 100)}%` }} /></div></div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "Relatórios" && <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Análise por prazo de entrega</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Tarefas com prazo entre {startDate.split("-").reverse().join("/")} e {endDate.split("-").reverse().join("/")}. Não representa a data real de conclusão.</p>
        </div>
        <div className="flex gap-1 rounded-xl bg-gray-100 dark:bg-gray-800 p-1" aria-label="Filtrar período">
          {([7, 30, 90] as const).map(days => (
            <button key={days} type="button" onClick={() => setPeriod(days)} aria-pressed={period === days}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${period === days ? "bg-green-600 text-white shadow-sm" : "text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700"}`}>
              {days} dias
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Taxa de conclusão", value: total > 0 ? `${rate}%` : "—", sub: total > 0 ? `${completed} de ${total} com prazo no período` : "Sem tarefas ainda" },
          { label: "Total de tarefas", value: total || "—", sub: total > 0 ? `${periodTasks.filter(t => t.status === "Em andamento").length} em andamento` : "Sem tarefas com prazo no período" },
          { label: "Progresso geral — projetos", value: projects.length > 0 ? `${avgProjectProgress}%` : "—", sub: projects.length > 0 ? `${projects.length} projeto${projects.length > 1 ? "s" : ""}` : "Sem projetos" },
          { label: "Progresso geral — metas", value: goals.length > 0 ? `${avgGoalProgress}%` : "—", sub: goals.length > 0 ? `${goals.length} meta${goals.length > 1 ? "s" : ""}` : "Sem metas" },
        ].map(c => <div key={c.label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5"><p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{c.label}</p><p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-0.5">{c.value}</p><p className="text-xs text-gray-400 dark:text-gray-500">{c.sub}</p></div>)}
      </div>
      {periodTasks.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-12"><EmptyState icon="📊" title="Nenhuma tarefa com prazo no período selecionado" sub="Escolha outro período ou cadastre prazos nas tarefas. Os indicadores gerais de projetos e metas continuam disponíveis acima." /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Tarefas por prazo — últimos {period} dias</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Distribuição das datas de entrega, não das datas de conclusão</p>
            {!hasPeriodData ? <EmptyState icon="📅" title="Sem tarefas com prazo no período" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={periodData} barCategoryGap={8}>
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#9ca3af" }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#9ca3af" }} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid #e5e7eb" }} />
                  <Bar dataKey="Pendentes" fill="#d1fae5" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Concluídas" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Status das Tarefas</h2>
            {statusCounts.length === 0 ? <EmptyState icon="🥧" title="Sem dados de status" /> : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart><Pie data={statusCounts} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">{statusCounts.map(d => <Cell key={d.name} fill={d.color} />)}</Pie><Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} /></PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-1 mt-2">{statusCounts.map((d, i) => <div key={d.name} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400"><div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />{d.name}<span className="ml-auto font-medium">{d.value}</span></div>)}</div>
              </>
            )}
          </div>
          {goals.length > 0 && (
            <div className="md:col-span-3 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Progresso por Meta</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Tarefas concluídas ÷ total de tarefas × 100</p>
              <ResponsiveContainer width="100%" height={Math.max(120, goals.length * 42)}>
                <BarChart data={goalProgressData} layout="vertical" barCategoryGap={6}>
                  <XAxis type="number" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#9ca3af" }} tickFormatter={v => `${v}%`} />
                  <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#6b7280" }} width={140} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid #e5e7eb" }} formatter={(v) => [`${v}%`, "Progresso"]} />
                  <Bar dataKey="progress" fill="#16a34a" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {projects.length > 0 && (
            <div className="md:col-span-3 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Progresso por Projeto</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Tarefas concluídas ÷ total de tarefas × 100</p>
              <div className="space-y-3">
                {projects.map(p => { const s = calcProjectProgress(p, tasks); return (
                  <div key={p.id}><div className="flex items-center justify-between mb-1"><span className="text-sm font-medium text-gray-800 dark:text-gray-200">{p.name}</span><span className="text-xs text-gray-400 dark:text-gray-500">{s.total === 0 ? "Sem tarefas" : `${s.done}/${s.total} · ${s.progress}%`}</span></div><div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden"><div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${s.progress}%` }} /></div></div>
                ); })}
              </div>
            </div>
          )}
        </div>
      )}
      </>}
    </div>
  );
}

// ─── Templates ────────────────────────────────────────────────────────────────
function TemplatesPage({ onNav }: { onNav: (s: Screen) => void }) {
  const { data, setProjects } = useData();
  const { projects } = data;
  const [selected, setSelected] = useState<string | null>(null); const [projName, setProjName] = useState("");
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Modelos de Projeto</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Escolha um modelo para criar um novo projeto. Os modelos nunca são alterados — você obtém uma cópia independente.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {TEMPLATES.map(t => (
          <div key={t.name} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
            <div className="text-3xl mb-3">{t.icon}</div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{t.name}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{t.desc}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">{TEMPLATE_DATA[t.name].length} tarefas incluídas</p>
            <button onClick={() => { setSelected(t.name); setProjName(t.name); }} className="w-full bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 text-green-700 dark:text-green-400 font-medium text-sm py-2 rounded-lg transition-colors">Usar Modelo</button>
          </div>
        ))}
      </div>
      {selected && (
        <Overlay onClose={() => setSelected(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{selected}</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Tarefas que serão criadas:</p>
            <div className="space-y-1.5 mb-5 max-h-48 overflow-y-auto pr-1">{TEMPLATE_DATA[selected].map((task, i) => <div key={i} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />{task}</div>)}</div>
            <div className="mb-5"><label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 block">Nome do projeto</label><input value={projName} onChange={e => setProjName(e.target.value)} className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200" /></div>
            <div className="flex gap-3"><button onClick={() => setSelected(null)} className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">Cancelar</button><button disabled={!projName.trim()} onClick={() => { setProjects([...projects, { id: Date.now(), name: projName, description: TEMPLATES.find(t => t.name === selected)!.desc, progress: 0, done: 0, total: TEMPLATE_DATA[selected].length }]); setSelected(null); onNav("projects"); }} className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium transition-colors">Criar Projeto</button></div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ─── Profile ──────────────────────────────────────────────────────────────────
function ProfilePage({ onNav }: { onNav: (s: Screen) => void }) {
  const { user, updateUser, logout } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(user?.name || ""); const [nameSaved, setNameSaved] = useState(false);
  const [twoFA, setTwoFA] = useState(false);
  const [showPwdModal, setShowPwdModal] = useState(false); const [currentPwd, setCurrentPwd] = useState(""); const [newPwd, setNewPwd] = useState(""); const [confirmPwd, setConfirmPwd] = useState(""); const [pwdError, setPwdError] = useState(""); const [pwdSaved, setPwdSaved] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (!f) return; const reader = new FileReader(); reader.onload = ev => { updateUser({ avatar: ev.target?.result as string }); }; reader.readAsDataURL(f); };
  const handleSaveName = () => { if (!name.trim()) return; updateUser({ name: name.trim() }); setNameSaved(true); setTimeout(() => setNameSaved(false), 2000); };
  const handleChangePwd = () => { if (!currentPwd) { setPwdError("Informe a senha atual."); return; } if (currentPwd !== user?.password) { setPwdError("Senha atual incorreta."); return; } if (!newPwd || newPwd.length < 6) { setPwdError("Mín. 6 caracteres."); return; } if (newPwd !== confirmPwd) { setPwdError("As senhas não coincidem."); return; } updateUser({ password: newPwd }); setPwdSaved(true); setCurrentPwd(""); setNewPwd(""); setConfirmPwd(""); setPwdError(""); setTimeout(() => { setShowPwdModal(false); setPwdSaved(false); }, 1500); };
  const initials = user?.name?.charAt(0).toUpperCase() || "?";
  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-8">Perfil</h1>
      <div className="pb-6 mb-6 border-b border-gray-100 dark:border-gray-800">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Foto de perfil</p>
        <div className="flex items-center gap-5">{user?.avatar ? <img src={user.avatar} alt="Avatar" className="w-20 h-20 rounded-full object-cover flex-shrink-0" /> : <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-green-700 dark:text-green-400 font-bold text-3xl flex-shrink-0">{initials}</div>}<div><button onClick={() => fileRef.current?.click()} className="text-sm font-medium border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg transition-colors">Carregar foto</button><p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">Máx. 2 MB — PNG, JPG</p><input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} /></div></div>
      </div>
      <div className="pb-6 mb-6 border-b border-gray-100 dark:border-gray-800"><label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">Nome</label><input value={name} onChange={e => setName(e.target.value)} type="text" className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200" /><button onClick={handleSaveName} className="mt-3 text-sm font-medium bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors">{nameSaved ? "✓ Salvo" : "Salvar"}</button></div>
      <div className="pb-6 mb-6 border-b border-gray-100 dark:border-gray-800"><label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">E-mail</label><div className="flex items-center gap-3"><input value={user?.email || ""} type="email" readOnly className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400" /><button onClick={() => onNav("recover-password")} className="text-sm font-medium border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 px-4 py-2.5 rounded-lg transition-colors flex-shrink-0">Alterar e-mail</button></div></div>
      <div className="pb-6 mb-6 border-b border-gray-100 dark:border-gray-800"><p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Senha</p><div className="flex items-center justify-between"><p className="text-sm text-gray-600 dark:text-gray-400">••••••••••••</p><button onClick={() => setShowPwdModal(true)} className="text-sm font-medium border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg transition-colors">Alterar senha</button></div></div>
      <div className="pb-6 mb-6 border-b border-gray-100 dark:border-gray-800"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-gray-900 dark:text-gray-100">Autenticação de dois fatores</p><p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Adicione uma segunda camada de proteção.</p></div><button onClick={() => setTwoFA(!twoFA)} className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ml-6 ${twoFA ? "bg-green-500" : "bg-gray-200 dark:bg-gray-700"}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${twoFA ? "left-6" : "left-1"}`} /></button></div></div>
      <div><p className="text-xs text-red-500 mb-3">Ações nesta seção são permanentes e não podem ser desfeitas.</p><button onClick={() => setShowDeleteModal(true)} className="text-sm font-medium text-red-600 hover:text-red-700 transition-colors">Excluir conta</button></div>
      {showPwdModal && <Overlay onClose={() => { setShowPwdModal(false); setPwdError(""); }}><div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6"><h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-5">Alterar Senha</h2>{pwdError && <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs rounded-lg px-3 py-2">{pwdError}</div>}{pwdSaved && <div className="mb-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 text-xs rounded-lg px-3 py-2">Senha alterada!</div>}<div className="space-y-4">{[{ label: "Senha atual", value: currentPwd, set: setCurrentPwd }, { label: "Nova senha", value: newPwd, set: setNewPwd }, { label: "Confirmar nova senha", value: confirmPwd, set: setConfirmPwd }].map(f => <div key={f.label}><label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 block">{f.label}</label><input type="password" value={f.value} onChange={e => { f.set(e.target.value); setPwdError(""); }} className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200" /></div>)}</div><div className="flex gap-3 mt-6"><button onClick={() => { setShowPwdModal(false); setPwdError(""); }} className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">Cancelar</button><button onClick={handleChangePwd} className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-lg py-2 text-sm font-medium transition-colors">Salvar</button></div></div></Overlay>}
      {showDeleteModal && <Overlay onClose={() => setShowDeleteModal(false)}><div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6"><h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Excluir conta?</h2><p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Esta ação é irreversível.</p><div className="flex gap-3"><button onClick={() => setShowDeleteModal(false)} className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancelar</button><button onClick={() => { logout(); onNav("landing"); }} className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">Confirmar</button></div></div></Overlay>}
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function SettingsPage() {
  const { data, setTheme, setNotifications, setGcal } = useData();
  const { theme, notifications, gcalConnected } = data;
  const [tab, setTab] = useState("Aparência");
  const [systemIsDark, setSystemIsDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const TABS = ["Aparência", "Notificações", "Integrações"];

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => setSystemIsDark(event.matches);
    setSystemIsDark(media.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  const previewIsDark = theme === "Escuro" || (theme === "Sistema" && systemIsDark);
  const previewBg = previewIsDark ? "bg-gray-950" : "bg-gray-50";
  const themeOptions: { value: Theme; icon: string; title: string; description: string }[] = [
    { value: "Claro", icon: "☀️", title: "Claro", description: "Tema fixo: o Organix permanece claro" },
    { value: "Escuro", icon: "🌙", title: "Escuro", description: "Tema fixo: o Organix permanece escuro" },
    { value: "Sistema", icon: "💻", title: "Sistema (automático)", description: `Segue o dispositivo · Agora: ${systemIsDark ? "Escuro" : "Claro"}` },
  ];
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Configurações</h1>
      <div className="flex flex-col sm:flex-row gap-6">
        <div className="sm:w-44 flex-shrink-0"><div className="flex sm:flex-col gap-1 overflow-x-auto pb-1 sm:pb-0">{TABS.map(t => <button key={t} onClick={() => setTab(t)} className={`flex-shrink-0 sm:w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${tab === t ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"}`}>{t}</button>)}</div></div>
        <div className="flex-1 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
          {tab === "Aparência" && (
            <div className="space-y-6">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-base">Aparência</h2>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 block">Tema</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
                  {themeOptions.map(option => (
                    <button
                      key={option.value}
                      onClick={() => setTheme(option.value)}
                      className={`relative text-left rounded-xl border p-4 transition-all ${theme === option.value ? "border-green-500 bg-green-50 dark:bg-green-900/20 ring-2 ring-green-500/15" : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600"}`}
                    >
                      {theme === option.value && <span className="absolute top-2 right-2 text-green-600 dark:text-green-400 text-sm font-bold">✓</span>}
                      <span className="text-2xl block mb-2">{option.icon}</span>
                      <span className={`text-sm font-semibold block ${theme === option.value ? "text-green-700 dark:text-green-400" : "text-gray-800 dark:text-gray-200"}`}>{option.title}</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 mt-1 block leading-relaxed">{option.description}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Preview</label>
                  {theme === "Sistema" && (
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
                      Sistema usando: {systemIsDark ? "Escuro" : "Claro"}
                    </span>
                  )}
                </div>
                <div className={`rounded-xl border p-4 transition-colors ${previewIsDark ? "border-gray-700" : "border-gray-200"} ${previewBg}`}>
                  <div className="flex gap-3">
                    <div className={`w-28 rounded-lg p-3 ${previewIsDark ? "bg-gray-800" : "bg-white border border-gray-200"}`}>
                      <div className="space-y-2">
                        {["Dashboard", "Tarefas", "Projetos"].map(i => (
                          <div key={i} className={`text-xs rounded px-2 py-1 ${i === "Dashboard" ? "bg-green-600 text-white" : previewIsDark ? "text-gray-300" : "text-gray-600"}`}>{i}</div>
                        ))}
                      </div>
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className={`h-4 rounded w-2/3 ${previewIsDark ? "bg-gray-700" : "bg-gray-300"}`} />
                      <div className={`h-3 rounded w-1/2 ${previewIsDark ? "bg-gray-700" : "bg-gray-200"}`} />
                      <div className={`h-8 rounded ${previewIsDark ? "bg-gray-800 border border-gray-700" : "bg-white border border-gray-200"}`} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {tab === "Notificações" && (
            <div className="space-y-5">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-base">Notificações</h2>
              {[{ key: "expired" as const, label: "Alertas de prazo vencido", desc: "Receba alertas quando tarefas passarem do prazo" }, { key: "daily" as const, label: "Lembretes de tarefas do dia", desc: "Notificação diária com suas tarefas do dia" }, { key: "weekly" as const, label: "Resumo semanal por e-mail", desc: "E-mail semanal com seu progresso e pendências" }, { key: "push" as const, label: "Notificações push", desc: "Receba notificações no navegador em tempo real" }].map(n => <div key={n.key} className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800 last:border-0"><div><p className="text-sm font-medium text-gray-900 dark:text-gray-100">{n.label}</p><p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{n.desc}</p></div><button onClick={() => setNotifications({ ...notifications, [n.key]: !notifications[n.key] })} className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ml-4 ${notifications[n.key] ? "bg-green-500" : "bg-gray-200 dark:bg-gray-700"}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${notifications[n.key] ? "left-6" : "left-1"}`} /></button></div>)}
            </div>
          )}
          {tab === "Integrações" && (
            <div className="space-y-5">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-base">Integrações</h2>
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex items-center gap-4"><div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center text-lg">📅</div><div className="flex-1"><p className="text-sm font-medium text-gray-900 dark:text-gray-100">Google Calendar</p><p className="text-xs text-gray-400 dark:text-gray-500">Sincronize tarefas com datas de entrega ao seu calendário</p>{gcalConnected && <p className="text-xs text-green-600 dark:text-green-400 mt-0.5 font-medium">✓ Conectado</p>}</div><button onClick={() => setGcal(!gcalConnected)} className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${gcalConnected ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40" : "bg-green-600 text-white hover:bg-green-700"}`}>{gcalConnected ? "Desconectar" : "Conectar"}</button></div>
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex items-center gap-4"><div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center text-lg">📦</div><div className="flex-1"><p className="text-sm font-medium text-gray-900 dark:text-gray-100">Exportar dados</p><p className="text-xs text-gray-400 dark:text-gray-500">Baixe todas as suas tarefas e projetos em CSV ou JSON</p></div><div className="flex gap-2"><button className="text-sm font-medium px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300">CSV</button><button className="text-sm font-medium px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300">JSON</button></div></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Onboarding ───────────────────────────────────────────────────────────────
function OnboardingPage({ onDone }: { onDone: () => void }) {
  const { data, setOnboardingDone, setProjects, setGoals, setEnergyLevel } = useData();
  const [step, setStep] = useState(0);
  const [areas, setAreas] = useState<string[]>([]);
  const [goalName, setGoalName] = useState("");
  const [projName, setProjName] = useState("");
  const [workStyle, setWorkStyle] = useState("");
  const [energy, setEnergy] = useState<EnergyLevel | null>(null);

  const AREAS = ["Estudos", "Trabalho", "Projetos pessoais", "Rotina", "Tudo"];
  const STYLES = ["Foco intenso", "Tarefas rápidas", "Um pouco de cada"];

  const finish = () => {
    if (goalName.trim()) {
      const newGoal: Goal = { id: Date.now(), name: goalName.trim(), description: "", progress: 0, dueDate: "", taskIds: [], projectIds: [] };
      if (projName.trim()) {
        const newProj = { id: Date.now() + 1, name: projName.trim(), description: `Projeto de ${goalName.trim()}`, progress: 0, done: 0, total: 0 };
        newGoal.projectIds = [newProj.id];
        setProjects([...data.projects, newProj]);
      }
      setGoals([...data.goals, newGoal]);
    } else if (projName.trim()) {
      setProjects([...data.projects, { id: Date.now(), name: projName.trim(), description: "", progress: 0, done: 0, total: 0 }]);
    }
    if (energy) setEnergyLevel(energy);
    setOnboardingDone();
    onDone();
  };

  const steps = [
    {
      title: "Comece em 60 segundos", sub: "Vamos configurar seu Organix rapidamente.\nVocê poderá alterar tudo depois.",
      content: (
        <div className="text-center py-4">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/40 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-6">🚀</div>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto leading-relaxed">Em apenas 5 perguntas rápidas, o Organix estará pronto para você.</p>
        </div>
      ),
    },
    {
      title: "O que você quer organizar?", sub: "Pode selecionar mais de uma área.",
      content: (
        <div className="flex flex-wrap gap-2 justify-center">
          {AREAS.map(a => (
            <button key={a} onClick={() => setAreas(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a])}
              className={`px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${areas.includes(a) ? "border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400" : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"}`}>
              {a}
            </button>
          ))}
        </div>
      ),
    },
    {
      title: "Qual é seu principal objetivo agora?", sub: "Crie uma meta para acompanhar seu progresso.",
      content: (
        <div className="space-y-3">
          <input value={goalName} onChange={e => setGoalName(e.target.value)} placeholder="Ex: Concluir TCC, Aprender React..."
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200" />
          <p className="text-xs text-gray-400 dark:text-gray-500">Deixe em branco para pular.</p>
        </div>
      ),
    },
    {
      title: "Quais projetos você precisa acompanhar?", sub: "Crie um projeto para organizar suas tarefas.",
      content: (
        <div className="space-y-3">
          <input value={projName} onChange={e => setProjName(e.target.value)} placeholder="Ex: TCC, Site do portfólio..."
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-200" />
          <p className="text-xs text-gray-400 dark:text-gray-500">Deixe em branco para pular.</p>
        </div>
      ),
    },
    {
      title: "Como você costuma trabalhar melhor?", sub: "",
      content: (
        <div className="flex flex-col gap-3">
          {STYLES.map(s => (
            <button key={s} onClick={() => setWorkStyle(s)}
              className={`px-4 py-3 rounded-xl border text-sm font-medium transition-colors text-left ${workStyle === s ? "border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400" : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"}`}>
              {s}
            </button>
          ))}
        </div>
      ),
    },
    {
      title: "Como está sua energia hoje?", sub: "O Organix usará isso para sugerir tarefas compatíveis.",
      content: (
        <div className="flex flex-col gap-3">
          {(["Alta", "Média", "Baixa"] as EnergyLevel[]).map(lvl => {
            const icons: Record<EnergyLevel, string> = { Alta: "⚡ Alta — pronto para desafios", Média: "◉ Média — focado no essencial", Baixa: "○ Baixa — tarefas mais simples" };
            return (
              <button key={lvl} onClick={() => setEnergy(lvl)}
                className={`px-4 py-3 rounded-xl border text-sm font-medium transition-colors text-left ${energy === lvl ? "border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400" : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"}`}>
                {icons[lvl]}
              </button>
            );
          })}
        </div>
      ),
    },
  ];

  const totalSteps = steps.length;
  const isLast = step === totalSteps - 1;
  const isFirst = step === 0;

  if (step === totalSteps) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 w-full max-w-sm p-8 text-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/40 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-6">🚀</div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Tudo pronto!</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Seu Organix foi configurado. Agora você pode:</p>
          <div className="space-y-2 text-left mb-8">
            {["Organizar suas tarefas", "Definir prioridades", "Executar tarefas com foco", "Acompanhar seus projetos", "Acompanhar suas metas"].map(i => (
              <div key={i} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <span className="text-green-500">✓</span> {i}
              </div>
            ))}
          </div>
          <button onClick={finish} className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl text-sm transition-colors">Ir para o Dashboard →</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 w-full max-w-sm p-8">
        {/* Progress bar */}
        <div className="flex gap-1 mb-6">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? "bg-green-500" : "bg-gray-200 dark:bg-gray-700"}`} />
          ))}
        </div>
        <span className="text-2xl font-bold text-green-700 dark:text-green-500">Organix</span>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-3 mb-1">{steps[step].title}</h2>
        {steps[step].sub && <p className="text-sm text-gray-500 dark:text-gray-400 mb-5 whitespace-pre-line">{steps[step].sub}</p>}
        <div className="mb-6">{steps[step].content}</div>
        <div className="flex gap-3">
          {!isFirst && <button onClick={() => setStep(s => s - 1)} className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Voltar</button>}
          <button onClick={() => isLast ? setStep(totalSteps) : setStep(s => s + 1)}
            className={`${isFirst ? "w-full" : "flex-1"} bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors`}>
            {isFirst ? "Começar" : isLast ? "Concluir" : "Próximo →"}
          </button>
        </div>
        {step > 0 && <button onClick={() => { setOnboardingDone(); onDone(); }} className="mt-3 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 block text-center w-full transition-colors">Pular por enquanto</button>}
      </div>
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────
const DEFAULT_POMODORO: PomodoroState = { taskId: null, status: "idle", secondsLeft: 25 * 60, focusDuration: 25, breakDuration: 5, sessionCount: 0 };

export default function App() {
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [user, setUser] = useState<UserAccount | null>(null);
  const [userData, setUserData] = useState<UserData>(defaultUserData());
  const [notification, setNotification] = useState<{ id: number; message: string; type: "success" | "error" } | null>(null);
  const notify = (message: string, type: "success" | "error" = "success") => {
    setNotification({ id: Date.now(), message, type });
  };
  useEffect(() => {
    if (!notification) return;
    const timeout = window.setTimeout(() => setNotification(current => current?.id === notification.id ? null : current), 4000);
    return () => window.clearTimeout(timeout);
  }, [notification]);
  const [pom, setPom] = useState<PomodoroState>(DEFAULT_POMODORO);
  const pomTaskRef = useRef<number | null>(null);
  const pomDurationRef = useRef<number>(25);

  useEffect(() => {
    if (!user) return;

    let ativo = true;

    (async () => {
      try {
        // Cada recurso é carregado independentemente: um erro em tarefas ou
        // projetos não deve impedir que as metas apareçam.
        const [resultadoTarefas, resultadoProjetos, resultadoMetas] = await Promise.allSettled([
          listarTarefas(),
          listarProjetos(),
          listarMetas(),
        ]);
        if (!ativo) return;

        if (resultadoTarefas.status === "rejected") console.error("Erro ao carregar tarefas:", resultadoTarefas.reason);
        if (resultadoProjetos.status === "rejected") console.error("Erro ao carregar projetos:", resultadoProjetos.reason);
        if (resultadoMetas.status === "rejected") console.error("Erro ao carregar metas:", resultadoMetas.reason);

        const tarefas = resultadoTarefas.status === "fulfilled"
          ? (resultadoTarefas.value.data ?? []).map(tarefaApiParaTask)
          : [];
        const projetos = resultadoProjetos.status === "fulfilled"
          ? (resultadoProjetos.value.data ?? []).map(projetoApiParaProject)
          : [];
        const metas = resultadoMetas.status === "fulfilled"
          ? (resultadoMetas.value.data ?? []).map(m => metaApiParaGoal(m, tarefas))
          : [];
        const tarefasComMetas = tarefas.map(t => ({
          ...t,
          goalId: metas.find(g => g.taskIds.includes(t.id))?.id,
        }));

        setUserData(d => ({
          ...d,
          tasks: resultadoTarefas.status === "fulfilled" ? tarefasComMetas : d.tasks,
          projects: resultadoProjetos.status === "fulfilled" ? projetos : d.projects,
          goals: resultadoMetas.status === "fulfilled" ? metas : d.goals,
        }));
      } catch (error) {
        if (error instanceof ApiError) {
          console.error("Erro ao carregar tarefas:", error.message);
        } else {
          console.error("Erro ao carregar tarefas:", error);
        }
      }
    })();

    return () => {
      ativo = false;
    };
  }, [user]);

  // Global Pomodoro timer
  useEffect(() => {
    if (pom.status !== "focus" && pom.status !== "break") return;
    const id = setInterval(() => {
      setPom(prev => {
        if (prev.secondsLeft <= 1) {
          if (prev.status === "focus") return { ...prev, status: "done", secondsLeft: 0, sessionCount: prev.sessionCount + 1 };
          return { ...prev, status: "idle", secondsLeft: prev.focusDuration * 60 };
        }
        return { ...prev, secondsLeft: prev.secondsLeft - 1 };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [pom.status]);

  // Record session when done
  useEffect(() => {
    if (pom.status === "done" && pom.taskId) {
      const session: FocusSession = { id: Date.now(), taskId: pom.taskId, date: new Date().toISOString().split("T")[0], duration: pom.focusDuration, completed: true };
      setUserData(d => ({
        ...d,
        focusSessions: [...d.focusSessions, session],
        tasks: d.tasks.map(t => t.id === pom.taskId ? { ...t, totalFocusTime: (t.totalFocusTime || 0) + pom.focusDuration } : t),
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pom.status]);

  useEffect(() => {
    const applyTheme = (t: Theme) => { const isDark = t === "Escuro" || (t === "Sistema" && window.matchMedia("(prefers-color-scheme: dark)").matches); document.documentElement.classList.toggle("dark", isDark); };
    applyTheme(userData.theme);
    if (userData.theme === "Sistema") { const mq = window.matchMedia("(prefers-color-scheme: dark)"); const handler = () => applyTheme("Sistema"); mq.addEventListener("change", handler); return () => mq.removeEventListener("change", handler); }
  }, [userData.theme]);

  const authCtx: AuthCtx = {
    user,
    login: async (email, password) => {
      try {
        const resposta = await apiLogin({ email, senha: password });
        if (!resposta.data) return "A API não retornou os dados do usuário.";
        const apiUser = resposta.data;
        const loggedUser: UserAccount = {
          id: String(apiUser.id),
          name: apiUser.nome,
          email: apiUser.email,
          password: "",
          avatar: null,
        };
        setUser(loggedUser);
        setUserData({ ...defaultUserData(), theme: loadUserTheme(loggedUser.id) });
        sessionStorage.setItem("organix_current_screen", "dashboard");
        setScreen("dashboard");
        return null;
      } catch (error) {
        if (error instanceof ApiError) return error.message;
        return "Não foi possível conectar à API.";
      }
    },
    loginGoogle: async () => {
      // Login Google ainda não possui endpoint no backend.
    },
    logout: async () => {
      try {
        await apiLogout();
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) console.error(error);
      } finally {
        setUser(null);
        setUserData(d => ({ ...defaultUserData(), theme: d.theme }));
        sessionStorage.removeItem("organix_current_screen");
        setScreen("landing");
      }
    },
    register: async (name, email, password) => {
      try {
        const resposta = await apiCadastrarUsuario({ nome: name, email, senha: password });
        if (!resposta.data) return "A API não retornou os dados do usuário.";
        const apiUser = resposta.data;
        const createdUser: UserAccount = {
          id: String(apiUser.id),
          name: apiUser.nome,
          email: apiUser.email,
          password: "",
          avatar: null,
        };
        setUser(createdUser);
        saveUserTheme(createdUser.id, "Claro");
        setUserData(defaultUserData());
        sessionStorage.removeItem("organix_current_screen");
        setScreen("onboarding");
        return null;
      } catch (error) {
        if (error instanceof ApiError) return error.message;
        return "Não foi possível conectar à API.";
      }
    },
    updateUser: (patch) => {
      if (!user) return;
      setUser(current => current ? { ...current, ...patch } : current);
    },
    resetPassword: (_email, _newPassword) => {
      // Recuperação de senha será ligada ao backend quando o endpoint existir.
    },
    findByEmail: (_email) => undefined,
  };

  const dataCtx: DataCtx = {
    data: userData,
    setTasks: novasTasks => {
      const antigasTasks = userData.tasks;

      // Atualiza a tela imediatamente.
      setUserData(d => ({ ...d, tasks: novasTasks }));

      if (!user) return;

      const antigasPorId = new Map<number, Task>(antigasTasks.map(t => [t.id, t]));
      const novasPorId = new Map<number, Task>(novasTasks.map(t => [t.id, t]));

      // CREATE: tarefa existe na nova lista, mas não existia antes.
      const criadas = novasTasks.filter(t => !antigasPorId.has(t.id));

      for (const tarefaLocal of criadas) {
        void (async () => {
          try {
            const resposta = await criarTarefa(taskParaPayload(tarefaLocal));
            if (!resposta.data) throw new Error("A API não confirmou a operação.");

            const tarefaBanco = tarefaApiParaTask(resposta.data);

            setUserData(d => ({
              ...d,
              tasks: d.tasks.map(t =>
                t.id === tarefaLocal.id
                  ? {
                      ...t,
                      ...tarefaBanco,
                      // Estes campos ainda são locais nesta etapa.
                      tags: tarefaLocal.tags,
                      goalId: tarefaLocal.goalId,
                      estimatedDuration: tarefaLocal.estimatedDuration,
                      energyRequirement: tarefaLocal.energyRequirement,
                      totalFocusTime: tarefaLocal.totalFocusTime,
                    }
                  : t
              ),
              goals: d.goals.map(g => ({
                ...g,
                taskIds: g.taskIds.map(id =>
                  id === tarefaLocal.id ? tarefaBanco.id : id
                ),
              })),
            }));
            notify("Tarefa criada com sucesso!");
          } catch (error) {
            notify("Não foi possível criar a tarefa.", "error");
            console.error("Erro ao criar tarefa:", error);

            // Se o banco recusou a criação, remove a tarefa otimista.
            setUserData(d => ({
              ...d,
              tasks: d.tasks.filter(t => t.id !== tarefaLocal.id),
            }));
          }
        })();
      }

      // UPDATE: tarefa já existia e algum campo persistido mudou.
      const atualizadas = novasTasks.filter(t => {
        const anterior = antigasPorId.get(t.id);
        if (!anterior) return false;

        return JSON.stringify(taskParaPayload(anterior)) !==
          JSON.stringify(taskParaPayload(t));
      });

      for (const tarefa of atualizadas) {
        void (async () => {
          try {
            const resposta = await atualizarTarefa(
              tarefa.id,
              taskParaPayload(tarefa)
            );

            if (!resposta.data) throw new Error("A API não confirmou a operação.");

            const tarefaBanco = tarefaApiParaTask(resposta.data);

            setUserData(d => ({
              ...d,
              tasks: d.tasks.map(t =>
                t.id === tarefa.id
                  ? {
                      ...t,
                      ...tarefaBanco,
                      tags: t.tags,
                      goalId: t.goalId,
                      estimatedDuration: t.estimatedDuration,
                      energyRequirement: t.energyRequirement,
                      totalFocusTime: t.totalFocusTime,
                    }
                  : t
              ),
            }));
            notify(tarefa.status === "Concluída" ? "Tarefa concluída com sucesso!" : "Tarefa atualizada com sucesso!");
          } catch (error) {
            notify("Não foi possível atualizar a tarefa.", "error");
            console.error("Erro ao atualizar tarefa:", error);
          }
        })();
      }

      // DELETE: tarefa existia antes e desapareceu da nova lista.
      const excluidas = antigasTasks.filter(t => !novasPorId.has(t.id));

      for (const tarefa of excluidas) {
        void (async () => {
          try {
            await excluirTarefa(tarefa.id);
            notify("Tarefa excluída com sucesso!");
          } catch (error) {
            notify("Não foi possível excluir a tarefa. Ela foi restaurada na lista.", "error");
            console.error("Erro ao excluir tarefa:", error);

            // Se a exclusão falhar, recoloca a tarefa na interface.
            setUserData(d => {
              if (d.tasks.some(t => t.id === tarefa.id)) return d;
              return { ...d, tasks: [...d.tasks, tarefa] };
            });
          }
        })();
      }
    },
    setProjects: novosProjetos => {
      const antigosProjetos = userData.projects;
      setUserData(d => ({ ...d, projects: novosProjetos }));

      if (!user) return;

      const antigosPorId = new Map<number, Project>(antigosProjetos.map(p => [p.id, p]));
      const novosPorId = new Map<number, Project>(novosProjetos.map(p => [p.id, p]));

      const criados = novosProjetos.filter(p => !antigosPorId.has(p.id));
      for (const projetoLocal of criados) {
        void (async () => {
          try {
            const resposta = await criarProjeto({ nome: projetoLocal.name.trim(), descricao: projetoLocal.description?.trim() ?? "" });
            if (!resposta.data) return;
            const projetoBanco = projetoApiParaProject(resposta.data);
            setUserData(d => ({
              ...d,
              projects: d.projects.map(p => p.id === projetoLocal.id ? projetoBanco : p),
              tasks: d.tasks.map(t => t.projectId === projetoLocal.id ? { ...t, projectId: projetoBanco.id, project: projetoBanco.name } : t),
              goals: d.goals.map(g => ({ ...g, projectIds: (g.projectIds || []).map(id => id === projetoLocal.id ? projetoBanco.id : id) })),
            }));
          } catch (error) {
            console.error("Erro ao criar projeto:", error);
            setUserData(d => ({ ...d, projects: d.projects.filter(p => p.id !== projetoLocal.id) }));
          }
        })();
      }

      const atualizados = novosProjetos.filter(p => {
        const anterior = antigosPorId.get(p.id);
        return !!anterior && (anterior.name !== p.name || anterior.description !== p.description);
      });
      for (const projeto of atualizados) {
        void (async () => {
          try {
            const resposta = await atualizarProjeto(projeto.id, { nome: projeto.name.trim(), descricao: projeto.description?.trim() ?? "" });
            if (!resposta.data) return;
            const projetoBanco = projetoApiParaProject(resposta.data);
            setUserData(d => ({
              ...d,
              projects: d.projects.map(p => p.id === projeto.id ? projetoBanco : p),
              tasks: d.tasks.map(t => t.projectId === projeto.id ? { ...t, project: projetoBanco.name } : t),
            }));
          } catch (error) {
            console.error("Erro ao atualizar projeto:", error);
          }
        })();
      }

      const excluidos = antigosProjetos.filter(p => !novosPorId.has(p.id));
      for (const projeto of excluidos) {
        void (async () => {
          try {
            await excluirProjeto(projeto.id);
            setUserData(d => ({
              ...d,
              tasks: d.tasks.map(t => t.projectId === projeto.id ? { ...t, projectId: null, project: "" } : t),
            }));
          } catch (error) {
            console.error("Erro ao excluir projeto:", error);
            setUserData(d => d.projects.some(p => p.id === projeto.id) ? d : { ...d, projects: [...d.projects, projeto] });
          }
        })();
      }
    },
    setGoals: g => setUserData(d => ({ ...d, goals: g })),
    setLabels: l => setUserData(d => ({ ...d, labels: l })),
    setTheme: t => {
      setUserData(d => ({ ...d, theme: t }));
      if (user) saveUserTheme(user.id, t);
    },
    setNotifications: n => setUserData(d => ({ ...d, notifications: n })),
    setGcal: v => setUserData(d => ({ ...d, gcalConnected: v })),
    setEnergyLevel: e => setUserData(d => ({ ...d, energyLevel: e })),
    setOnboardingDone: () => setUserData(d => ({ ...d, onboardingDone: true })),
    addFocusSession: s => setUserData(d => ({ ...d, focusSessions: [...d.focusSessions, s] })),
  };

  const pomodoroCtx: PomodoroCtx = {
    pomodoro: pom,
    startFocus: (taskId, minutes = 25) => {
      pomTaskRef.current = taskId; pomDurationRef.current = minutes;
      setPom({ taskId, status: "focus", secondsLeft: minutes * 60, focusDuration: minutes, breakDuration: 5, sessionCount: pom.taskId === taskId ? pom.sessionCount : 0 });
    },
    pauseFocus: () => setPom(p => ({ ...p, status: "paused" })),
    resumeFocus: () => setPom(p => ({ ...p, status: "focus" })),
    stopFocus: (completed = false) => {
      if (completed && pom.taskId) {
        const session: FocusSession = { id: Date.now(), taskId: pom.taskId, date: new Date().toISOString().split("T")[0], duration: Math.round((pom.focusDuration * 60 - pom.secondsLeft) / 60) || 1, completed: true };
        setUserData(d => ({ ...d, focusSessions: [...d.focusSessions, session], tasks: d.tasks.map(t => t.id === pom.taskId ? { ...t, totalFocusTime: (t.totalFocusTime || 0) + session.duration } : t) }));
      }
      setPom(DEFAULT_POMODORO);
    },
    startBreak: () => setPom(p => ({ ...p, status: "break", secondsLeft: p.breakDuration * 60 })),
  };

  const nav = (s: Screen) => {
    if (["landing", "login", "create-account"].includes(s) && user) {
      void authCtx.logout();
      return;
    }

    const telasInternas: Screen[] = ["dashboard", "tasks", "projects", "goals", "reports", "templates", "settings", "profile"];
    if (telasInternas.includes(s)) {
      sessionStorage.setItem("organix_current_screen", s);
    }

    setScreen(s);
  };
  const AUTH_SCREENS: Screen[] = ["landing", "login", "create-account", "recover-password", "onboarding"];
  const isInner = !AUTH_SCREENS.includes(screen);

  return (
    <AuthContext.Provider value={authCtx}>
      <DataContext.Provider value={dataCtx}>
        <PomodoroContext.Provider value={pomodoroCtx}>
          {notification && (
            <div role="status" aria-live="polite" className={`fixed bottom-5 right-5 z-[100] max-w-sm rounded-xl border px-4 py-3 shadow-xl flex items-center gap-3 bg-white dark:bg-gray-900 text-sm ${notification.type === "success" ? "border-green-200 dark:border-green-800 text-green-700 dark:text-green-400" : "border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"}`}>
              <span aria-hidden="true" className="text-lg">{notification.type === "success" ? "✓" : "!"}</span>
              <span className="flex-1">{notification.message}</span>
              <button type="button" aria-label="Fechar notificação" onClick={() => setNotification(null)} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">✕</button>
            </div>
          )}
          {!isInner ? (
            <>
              {screen === "landing" && <LandingPage onNav={nav} />}
              {screen === "login" && <LoginPage onNav={s => setScreen(s)} />}
              {screen === "create-account" && <CreateAccountPage onNav={s => setScreen(s)} />}
              {screen === "recover-password" && <RecoverPasswordPage onNav={s => setScreen(s)} />}
              {screen === "onboarding" && <OnboardingPage onDone={() => setScreen("dashboard")} />}
            </>
          ) : (
            <InnerLayout current={screen} onNav={nav}>
              {screen === "dashboard" && <DashboardPage onNav={nav} />}
              {screen === "tasks" && <TasksPage />}
              {screen === "projects" && <ProjectsPage onNav={nav} />}
              {screen === "goals" && <GoalsPage />}
              {screen === "reports" && <ReportsPage />}
              {screen === "templates" && <TemplatesPage onNav={nav} />}
              {screen === "settings" && <SettingsPage />}
              {screen === "profile" && <ProfilePage onNav={nav} />}
            </InnerLayout>
          )}
        </PomodoroContext.Provider>
      </DataContext.Provider>
    </AuthContext.Provider>
  );
}
