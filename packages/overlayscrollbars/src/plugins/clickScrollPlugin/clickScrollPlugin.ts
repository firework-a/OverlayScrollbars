import type { StaticPlugin } from '../plugins';
import { animateNumber, assignDeep, isFunction, noop, selfClearTimeout } from '../../support';
import { ScrollbarsClickScrollBehavior, ScrollbarsClickScrollBehaviorOptions } from '../../options';

export const clickScrollPluginModuleName = '__osClickScrollPlugin';

export const ClickScrollPlugin = /* @__PURE__ */ (() => ({
  [clickScrollPluginModuleName]: {
    static:
      () =>
      (
        scrollRelative: (deltaScroll: number) => void,
        moveHandleRelative: (deltaMovement: number) => void,
        getHandleOffset: () => number,
        targetDeltaMovement: number,
        viewportSize: number,
        clickScrollOption: ScrollbarsClickScrollBehavior,
        isHorizontal: boolean,
        onClickScrollCompleted: (stopped: boolean) => void
      ) => {
        // click scroll animation has 2 main parts:
        // 1. the "click"
        // 2. the "press" which scrolls to the point where the cursor is located
        // The "click" should not be canceled by a "pointerup" event because very fast clicks or taps would cancel it too fast
        // The "click" should only be canceled by a subsequent "pointerdown" event because otherwise 2 animations would run
        // The "press" should be canceld by the next "pointerup" event

        // the animation flow:
        // 1. The "click" which scroll distance x in a certain amount of time
        // 2. Short delay after the click animation until the press animation starts
        // 3. The press animation determines how many viewportSize distances it needs to reach the end point
        // 4. The press animation wants to always finish the last viewportSize distance with a "ease out" animation
        //    If the press animation needs to travel <=2.2 viewportSize distances to the target its a single "ease in out" animation
        //    Otherwise the press animation does a linear scroll animation to (targetPoistion - clickDistance)
        //    And the last viewportSize distance is then a "ease out" animation

        let stopped = false;
        let stopPressAnimation = noop;
        const defaultClickScrollOptions: ScrollbarsClickScrollBehaviorOptions = {
          clickScrollDistance: viewportSize,
          clickScrollDuration: 200,
          clickPressDelay: 150,
          pressDistanceDuration: 90,
        };
        const easeOutQuad = (x: number) => 1 - (1 - x) * (1 - x);
        const easeInOutQuad = (x: number) =>
          x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
        const { clickScrollDistance, clickScrollDuration, clickPressDelay, pressDistanceDuration } =
          assignDeep(
            {},
            defaultClickScrollOptions,
            isFunction(clickScrollOption)
              ? clickScrollOption(isHorizontal)
              : defaultClickScrollOptions
          );
        const clickScrollDistanceIsTargetDeltaMovement = clickScrollDistance === 0;
        const pressInOutMs = pressDistanceDuration * 2.3;
        const pressOutMs = pressDistanceDuration * 2.5;
        const viewportSizeScalingFactor = clickScrollDistance
          ? viewportSize / clickScrollDistance
          : 0;
        const [setPressAnimationTimeout, clearPressAnimationTimeout] = selfClearTimeout(
          // use a at least a very small delay here so `afterClickHandleOffset` is not the same as `beforeClickHandleOffset` because scroll didn't happen yet
          Math.max(22, clickPressDelay)
        );
        const beforeClickHandleOffset = getHandleOffset();
        const targetDeltaMovementSign = Math.sign(targetDeltaMovement);

        const stopClickAnimation = animateNumber(
          0,
          clickScrollDistanceIsTargetDeltaMovement
            ? targetDeltaMovement
            : clickScrollDistance * targetDeltaMovementSign,
          clickScrollDuration,
          (clickAnimationProgress, _, clickAnimationCompleted) => {
            if (clickScrollDistanceIsTargetDeltaMovement) {
              moveHandleRelative(clickAnimationProgress);
            } else {
              scrollRelative(clickAnimationProgress);
            }

            if (clickAnimationCompleted) {
              onClickScrollCompleted(stopped);

              setPressAnimationTimeout(() => {
                if (stopped || clickScrollDistanceIsTargetDeltaMovement || !pressDistanceDuration) {
                  return;
                }

                const afterClickHandleOffset = getHandleOffset();
                const clickScrollHandleDeltaMovement =
                  afterClickHandleOffset - beforeClickHandleOffset;
                const clickScrollHandleDeltaMovementViewportSize =
                  clickScrollHandleDeltaMovement * viewportSizeScalingFactor;
                const remainingTargetOffsetDistance =
                  targetDeltaMovement - clickScrollHandleDeltaMovement;
                const remainingClickScrollHandleDeltaMovements =
                  clickScrollHandleDeltaMovementViewportSize
                    ? remainingTargetOffsetDistance / clickScrollHandleDeltaMovementViewportSize
                    : 0;
                const isInOutAnimation = remainingClickScrollHandleDeltaMovements <= 2.2;
                const durationScalingFactor = Math.max(
                  1,
                  remainingClickScrollHandleDeltaMovements || 0
                );
                const continueWithPress =
                  (!remainingClickScrollHandleDeltaMovements ||
                    remainingClickScrollHandleDeltaMovements > 0.5) &&
                  Math.sign(remainingTargetOffsetDistance) === targetDeltaMovementSign;

                if (continueWithPress) {
                  stopPressAnimation = animateNumber(
                    clickScrollHandleDeltaMovement,
                    isInOutAnimation
                      ? targetDeltaMovement
                      : targetDeltaMovement - clickScrollHandleDeltaMovementViewportSize,
                    isInOutAnimation
                      ? pressInOutMs * durationScalingFactor
                      : pressDistanceDuration * durationScalingFactor,
                    (progress, _, completed) => {
                      moveHandleRelative(progress);

                      if (completed && !isInOutAnimation) {
                        stopPressAnimation = animateNumber(
                          progress,
                          targetDeltaMovement,
                          pressOutMs,
                          moveHandleRelative,
                          easeOutQuad
                        );
                      }
                    },
                    isInOutAnimation && easeInOutQuad
                  );
                }
              });
            }
          },
          easeInOutQuad
        );

        return (stopClick?: boolean) => {
          stopped = true;

          if (stopClick) {
            stopClickAnimation();
          }

          clearPressAnimationTimeout();
          stopPressAnimation();
        };
      },
  },
}))() satisfies StaticPlugin<typeof clickScrollPluginModuleName>;
