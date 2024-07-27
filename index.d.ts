declare module "hot-module-replacement" {
  export default function enableModuleReplacement(options: {
    ignore?: ((path: string) => void) | RegExp;
    onReloaded?: (
      allReloadedModulePaths: string[],
      rootPaths: string[]
    ) => void;
    onWatched?: (path: string) => void;
  }): { invalidateModules: (paths: string[]) => void };
}

interface NodeModule {
  hot: {
    active: boolean;

    accept(dep: string, callback: (dep: string) => void): void;
    accept(): void;
    accept(selfAccepted: boolean): void;
    accept(callbacks: { [dep: string]: (path: string) => void }): void;
    accept(dep: string): void;

    decline(): void;
    decline(dep: string): void;
    decline(deps: string[]): void;

    dispose: (callback: () => void) => void;
    addDisposeHandler: (callback: () => void) => void;
    removeDisposeHandler: (callback: () => void) => void;
  };
}
