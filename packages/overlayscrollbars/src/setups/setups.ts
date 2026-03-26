import type { OptionsCheckFn, Options, PartialOptions, ReadonlyOptions } from '../options';
import type { DeepReadonly } from '../typings';
import type { InitializationTarget } from '../initialization';
import type { ObserversSetupState, ObserversSetupUpdateHints } from './observersSetup';
import type { StructureSetupState, StructureSetupUpdateHints } from './structureSetup';
import type { StructureSetupElementsObj } from './structureSetup/structureSetup.elements';
import type { ScrollbarsSetupElementsObj } from './scrollbarsSetup/scrollbarsSetup.elements';
import { createOptionCheck } from '../options';
import {
  assignDeep,
  bind,
  getElementScroll,
  isEmptyObject,
  keys,
  runEachAndClear,
  scrollElementTo,
} from '../support';
import { createObserversSetup } from './observersSetup';
import { createScrollbarsSetup } from './scrollbarsSetup';
import { createStructureSetup } from './structureSetup';

export type SetupUpdateHints = Partial<Record<string, boolean>>;

export type SetupUpdateInfo = {
  _checkOption: OptionsCheckFn<Options>;
  _changedOptions: DeepReadonly<PartialOptions>;
  _force: boolean;
};

export type Setup<
  U extends SetupUpdateInfo,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  S extends Record<string, any>,
  H extends SetupUpdateHints | void,
> = [
  /** The create function which returns the `destroy` function. */
  _create: () => () => void,
  /** Function which updates the setup and returns the update result. */
  _update: (updateInfo: DeepReadonly<U>) => H,
  /** Function which returns the current state. */
  _state: DeepReadonly<S>,
];

export interface SetupsUpdateInfo {
  /** The options that changed or `undefined` if none changed. */
  _changedOptions?: PartialOptions;
  /** Whether chache should be ignored. */
  _force?: boolean;
  /** Whether observers should take their records and thus update as well. */
  _takeRecords?: boolean;
}

export interface SetupsInstanceState {
  /** Whether the instance is sleeping. */
  _sleeping: boolean;
  /** Whether the instance is destroyed. */
  _destroyed: boolean;
}

export interface SetupsUpdateHints {
  readonly _observersUpdateHints: DeepReadonly<ObserversSetupUpdateHints>;
  readonly _structureUpdateHints: DeepReadonly<StructureSetupUpdateHints>;
}

export interface SetupsState {
  readonly _instanceState: DeepReadonly<SetupsInstanceState>;
  readonly _observersSetupState: DeepReadonly<ObserversSetupState>;
  readonly _structureSetupState: DeepReadonly<StructureSetupState>;
}

export interface SetupsElements {
  readonly _structureSetupElements: DeepReadonly<StructureSetupElementsObj>;
  readonly _scrollbarsSetupElements: DeepReadonly<ScrollbarsSetupElementsObj>;
}

export type Setups = [
  construct: () => () => void,
  update: (updateInfo: DeepReadonly<SetupsUpdateInfo>) => boolean,
  updateSleep: (sleeping: boolean) => void,
  cloneScrollbar: () => void,
  getState: () => DeepReadonly<SetupsState>,
  elements: DeepReadonly<SetupsElements>,
  canceled: () => void,
];

export const createSetups = (
  target: InitializationTarget,
  options: ReadonlyOptions,
  onUpdated: (updateInfo: SetupsUpdateInfo, updateHints: SetupsUpdateHints) => void,
  onScroll: (scrollEvent: Event) => void
): Setups => {
  let cacheAndOptionsInitialized = false;
  const instanceState: SetupsInstanceState = {
    _sleeping: false,
    _destroyed: false,
  };
  const getCurrentOption = createOptionCheck(options, {});
  const [
    structureSetupCreate,
    structureSetupUpdate,
    structureSetupState,
    structureSetupElements,
    structureSetupCanceled,
  ] = createStructureSetup(target);
  const [observersSetupCreate, observersSetupUpdate, observersSetupState] = createObserversSetup(
    structureSetupElements,
    structureSetupState,
    getCurrentOption,
    (observersUpdateHints) => {
      update({}, observersUpdateHints);
    }
  );
  const [scrollbarsSetupCreate, scrollbarsSetupUpdate, , scrollbarsSetupElements] =
    createScrollbarsSetup(
      target,
      options,
      instanceState,
      observersSetupState,
      structureSetupState,
      structureSetupElements,
      onScroll
    );

  const updateHintsAreTruthy = (hints: SetupUpdateHints) =>
    keys(hints).some((key) => !!hints[key as keyof typeof hints]);

  const update = (
    updateInfo: SetupsUpdateInfo,
    observerUpdateHints?: Readonly<ObserversSetupUpdateHints>
  ): boolean => {
    const { _sleeping, _destroyed } = instanceState;
    if (_destroyed || (_sleeping && cacheAndOptionsInitialized)) {
      return false;
    }

    const { _changedOptions: rawChangedOptions, _force: rawForce, _takeRecords } = updateInfo;

    const _changedOptions = rawChangedOptions || {};
    const _force = !!rawForce || !cacheAndOptionsInitialized;
    const baseUpdateInfoObj: SetupUpdateInfo = {
      _checkOption: createOptionCheck(options, _changedOptions, _force),
      _changedOptions,
      _force,
    };

    const observersHints =
      observerUpdateHints ||
      observersSetupUpdate(
        assignDeep({}, baseUpdateInfoObj, {
          _takeRecords,
        })
      );

    const structureHints = structureSetupUpdate(
      assignDeep({}, baseUpdateInfoObj, {
        _observersState: observersSetupState,
        _observersUpdateHints: observersHints,
      })
    );

    scrollbarsSetupUpdate(
      assignDeep({}, baseUpdateInfoObj, {
        _observersUpdateHints: observersHints,
        _structureUpdateHints: structureHints,
      })
    );

    const truthyObserversHints = updateHintsAreTruthy(observersHints);
    const truthyStructureHints = updateHintsAreTruthy(structureHints);
    const changed =
      truthyObserversHints || truthyStructureHints || !isEmptyObject(_changedOptions) || _force;

    cacheAndOptionsInitialized = true;

    if (changed) {
      onUpdated(updateInfo, {
        _observersUpdateHints: observersHints,
        _structureUpdateHints: structureHints,
      });
    }

    return changed;
  };

  return [
    () => {
      const { _originalScrollOffsetElement, _scrollOffsetElement, _removeScrollObscuringStyles } =
        structureSetupElements;
      const initialScroll = getElementScroll(_originalScrollOffsetElement);
      const destroyFns = [
        observersSetupCreate(),
        structureSetupCreate(),
        scrollbarsSetupCreate(),
        () => {
          instanceState._destroyed = true;
        },
      ];
      const revertScrollObscuringStyles = _removeScrollObscuringStyles();

      scrollElementTo(_scrollOffsetElement, initialScroll);
      revertScrollObscuringStyles();

      return bind(runEachAndClear, destroyFns);
    },
    update,
    (sleeping) => {
      const oldSleeping = instanceState._sleeping;
      instanceState._sleeping = sleeping;

      if (!sleeping && oldSleeping !== sleeping) {
        update({ _force: true, _takeRecords: true });
      }
    },
    () => {
      scrollbarsSetupUpdate({
        _checkOption: createOptionCheck(options, {}, false),
        _changedOptions: {},
        _force: false,
      });
    },
    () => ({
      _instanceState: instanceState,
      _observersSetupState: observersSetupState,
      _structureSetupState: structureSetupState,
    }),
    {
      _structureSetupElements: structureSetupElements,
      _scrollbarsSetupElements: scrollbarsSetupElements,
    },
    structureSetupCanceled,
  ];
};
