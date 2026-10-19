const API_BASE_URL =
  "http://127.0.0.1/gerenciador_tarefas/api/index.php";

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const response = await fetch(
    `${API_BASE_URL}${endpoint}`,
    {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    }
  );

  let dados: ApiResponse<T> | null = null;

  try {
    dados = await response.json();
  } catch {
    throw new ApiError(
      "A API retornou uma resposta inválida.",
      response.status
    );
  }

  if (!response.ok) {
    throw new ApiError(
      dados?.message ||
        "Ocorreu um erro na comunicação com a API.",
      response.status
    );
  }

  return dados;
}

/* =========================
   USUÁRIO
========================= */

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  data_criacao: string;
}

export interface LoginPayload {
  email: string;
  senha: string;
}

export interface CadastroPayload {
  nome: string;
  email: string;
  senha: string;
}

/* =========================
   LOGIN
========================= */

export async function login(
  dados: LoginPayload
): Promise<ApiResponse<Usuario>> {
  return request<Usuario>("/login", {
    method: "POST",
    body: JSON.stringify(dados),
  });
}

/* =========================
   CADASTRO
========================= */

export async function cadastrarUsuario(
  dados: CadastroPayload
): Promise<ApiResponse<Usuario>> {
  return request<Usuario>("/usuarios", {
    method: "POST",
    body: JSON.stringify(dados),
  });
}

/* =========================
   LOGOUT
========================= */

export async function logout(): Promise<ApiResponse> {
  return request("/logout", {
    method: "POST",
  });
}

/* =========================
   USUÁRIO ATUAL
========================= */

export async function obterUsuarioAtual(): Promise<
  ApiResponse<Usuario>
> {
  return request<Usuario>("/usuarios", {
    method: "GET",
  });
}

/* =========================
   TAREFAS
========================= */

export type TarefaPrioridadeApi = "baixa" | "media" | "alta";
export type TarefaStatusApi = "pendente" | "em_andamento" | "concluida";

export interface TarefaApi {
  id: number;
  usuario_id: number;
  projeto_id: number | null;
  projeto_nome: string | null;
  titulo: string;
  descricao: string | null;
  prioridade: TarefaPrioridadeApi;
  importante: number;
  urgente: number;
  status: TarefaStatusApi;
  data_criacao: string;
  prazo: string | null;
}

export interface TarefaPayload {
  projeto_id: number | null;
  titulo: string;
  descricao: string;
  prioridade: TarefaPrioridadeApi;
  importante: number;
  urgente: number;
  status: TarefaStatusApi;
  prazo: string | null;
}

export async function listarTarefas(): Promise<ApiResponse<TarefaApi[]>> {
  return request<TarefaApi[]>("/tarefas", {
    method: "GET",
  });
}

export async function criarTarefa(
  dados: TarefaPayload
): Promise<ApiResponse<TarefaApi>> {
  return request<TarefaApi>("/tarefas", {
    method: "POST",
    body: JSON.stringify(dados),
  });
}

export async function atualizarTarefa(
  id: number,
  dados: TarefaPayload
): Promise<ApiResponse<TarefaApi>> {
  return request<TarefaApi>(`/tarefas/${id}`, {
    method: "PUT",
    body: JSON.stringify(dados),
  });
}

export async function excluirTarefa(
  id: number
): Promise<ApiResponse> {
  return request(`/tarefas/${id}`, {
    method: "DELETE",
  });
}



/* =========================
   PROJETOS
========================= */

export interface ProjetoApi {
  id: number;
  usuario_id: number;
  nome: string;
  descricao: string | null;
  data_criacao: string;
}

export interface ProjetoPayload {
  nome: string;
  descricao: string;
}

export async function listarProjetos(): Promise<ApiResponse<ProjetoApi[]>> {
  return request<ProjetoApi[]>("/projetos", { method: "GET" });
}

export async function criarProjeto(dados: ProjetoPayload): Promise<ApiResponse<ProjetoApi>> {
  return request<ProjetoApi>("/projetos", { method: "POST", body: JSON.stringify(dados) });
}

export async function atualizarProjeto(id: number, dados: ProjetoPayload): Promise<ApiResponse<ProjetoApi>> {
  return request<ProjetoApi>(`/projetos/${id}`, { method: "PUT", body: JSON.stringify(dados) });
}

export async function excluirProjeto(id: number): Promise<ApiResponse> {
  return request(`/projetos/${id}`, { method: "DELETE" });
}


/* =========================
   METAS
========================= */

export interface MetaApi {
  id: number;
  usuario_id: number;
  titulo: string;
  descricao: string | null;
  prazo: string | null;
  concluida: number;
  data_criacao: string;
  projeto_ids: number[];
  tarefa_ids: number[];
}

export interface MetaPayload {
  titulo: string;
  descricao: string;
  prazo: string | null;
  concluida: number;
  projeto_ids: number[];
  tarefa_ids: number[];
}

export async function listarMetas(): Promise<ApiResponse<MetaApi[]>> {
  return request<MetaApi[]>("/metas", { method: "GET" });
}

export async function criarMeta(dados: MetaPayload): Promise<ApiResponse<MetaApi>> {
  return request<MetaApi>("/metas", { method: "POST", body: JSON.stringify(dados) });
}

export async function atualizarMeta(id: number, dados: MetaPayload): Promise<ApiResponse<MetaApi>> {
  return request<MetaApi>(`/metas/${id}`, { method: "PUT", body: JSON.stringify(dados) });
}

export async function excluirMeta(id: number): Promise<ApiResponse> {
  return request(`/metas/${id}`, { method: "DELETE" });
}
