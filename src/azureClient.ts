import type { Config } from "./config.js";

export interface RequestOptions {
  /** HTTP method, defaults to GET */
  method?: string;
  /** Query parameters. api-version is added automatically unless provided here. */
  query?: Record<string, string | number | boolean | undefined>;
  /** JSON body for POST/PATCH/PUT */
  body?: unknown;
  /** Override the project segment. Falls back to the configured default project. */
  project?: string;
  /** If true, the path is treated as already including the project (or being project-less). */
  raw?: boolean;
  /** Override api-version for this single request (some endpoints need a -preview suffix). */
  apiVersion?: string;
  /** content-type for the request body; defaults to application/json */
  contentType?: string;
}

/**
 * Thin wrapper around the Azure DevOps Server REST API.
 *
 * Authentication uses HTTP Basic with an empty username and the PAT as the
 * password — the standard scheme Azure DevOps expects for token auth.
 */
export class AzureDevOpsClient {
  private readonly authHeader: string;

  constructor(private readonly config: Config) {
    const token = Buffer.from(`:${config.pat}`).toString("base64");
    this.authHeader = `Basic ${token}`;
  }

  get defaultProject(): string | undefined {
    return this.config.defaultProject;
  }

  /**
   * Build a full URL. When `raw` is false (default), a project segment is
   * inserted between the collection URL and the path.
   */
  private buildUrl(path: string, opts: RequestOptions): string {
    const cleanPath = path.replace(/^\/+/, "");
    let base = this.config.orgUrl;

    if (!opts.raw) {
      // Treat empty string the same as omitted — fall back to the configured default.
      const project = opts.project?.trim() || this.config.defaultProject;
      if (!project) {
        throw new Error(
          "No project specified and AZDO_PROJECT is not set. Pass a 'project' argument."
        );
      }
      base += `/${encodeURIComponent(project)}`;
    }

    const url = new URL(`${base}/${cleanPath}`);

    const query = opts.query ?? {};
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    if (!url.searchParams.has("api-version")) {
      url.searchParams.set("api-version", opts.apiVersion ?? this.config.apiVersion);
    }
    return url.toString();
  }

  async request<T = any>(path: string, opts: RequestOptions = {}): Promise<T> {
    const url = this.buildUrl(path, opts);
    const method = opts.method ?? "GET";

    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      Accept: "application/json",
    };

    let body: string | undefined;
    if (opts.body !== undefined) {
      headers["Content-Type"] = opts.contentType ?? "application/json";
      body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    let res: Response;
    try {
      res = await fetch(url, { method, headers, body, signal: controller.signal });
    } catch (err) {
      const msg = (err as Error).name === "AbortError"
        ? `Request timed out after 30s calling ${method} ${url}`
        : `Network error calling ${method} ${url}: ${(err as Error).message}`;
      throw new Error(msg);
    } finally {
      clearTimeout(timeout);
    }

    const text = await res.text();

    if (!res.ok) {
      // Azure DevOps returns JSON errors with a "message" field; surface it.
      let detail = text;
      try {
        const parsed = JSON.parse(text);
        if (parsed?.message) detail = parsed.message;
      } catch {
        /* keep raw text */
      }
      // A common gotcha on-prem: a 203 / HTML login page means auth failed.
      if (text.trimStart().startsWith("<")) {
        detail =
          "Received an HTML response instead of JSON. This usually means the PAT is invalid/expired " +
          "or the URL is wrong (check AZDO_ORG_URL points at the collection).";
      }
      throw new Error(`Azure DevOps API ${res.status} ${res.statusText}: ${detail}`);
    }

    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }
}
