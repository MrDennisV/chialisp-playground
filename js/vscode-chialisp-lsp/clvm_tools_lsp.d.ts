/* tslint:disable */
/* eslint-disable */
export function create_lsp_service(file_reader: any, err_writer: any): number;
export function destroy_lsp_service(lsp: number): void;
export function lsp_service_handle_msg(lsp_id: number, msg: string): any[];
export function create_dbg_service(file_reader: any, err_writer: any): number;
export function destroy_dbg_service(lsp: number): void;
export function dbg_service_handle_msg(lsp_id: number, msg: string): any[];
export function compile(input_js: any, filename_js: any, search_paths_js: any[], file_reader: any): any;
export function run(compiled_hex: any, solution_params: any): any;
export function curry(compiled_hex: any, curry_params: any): any;
export function get_tree_hash(hex_input: any): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly create_lsp_service: (a: any, b: any) => number;
  readonly destroy_lsp_service: (a: number) => void;
  readonly lsp_service_handle_msg: (a: number, b: number, c: number) => [number, number];
  readonly create_dbg_service: (a: any, b: any) => number;
  readonly destroy_dbg_service: (a: number) => void;
  readonly dbg_service_handle_msg: (a: number, b: number, c: number) => [number, number];
  readonly compile: (a: any, b: any, c: number, d: number, e: any) => any;
  readonly run: (a: any, b: any) => any;
  readonly curry: (a: any, b: any) => any;
  readonly get_tree_hash: (a: any) => any;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_export_2: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __externref_drop_slice: (a: number, b: number) => void;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
