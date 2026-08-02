// pos_modules/orders/order-editor/index.ts
// Barrel export for the order-editor sub-module

export { default as OrderEditor } from './OrderEditor';
export type { OrderEditorHandle, OrderEditorProps } from './types';
export { useOrderEditorState, flushOrderEditorCache } from './useOrderEditorState';
