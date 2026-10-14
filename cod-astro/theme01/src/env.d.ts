/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare global {
  namespace App {
    interface Locals {
      channelUnavailable?: boolean;
    }
  }

  interface SelectOption {
    value: string;
    label: string;
  }

  interface Window {
    __selectSetLoading: (id: string, loading: boolean, loadingText: string) => void;
    __selectPopulate: (id: string, options: SelectOption[], placeholder: string) => void;
    __selectSetDisabled: (id: string, disabledText: string) => void;
  }
}

export {};
