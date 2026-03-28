import type { StaticPlugin } from '../plugins';
import { animateNumber, getClientSize, noop, selfClearTimeout } from '../../support';

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
        viewport: HTMLElement,
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
        // 3. The press animation determines how many "click" distances it needs to reach the end point
        // 4. The press animation wants to always finish the last "click" distance with a "ease out" animation
        //    If the press animation needs to travel <=1.5 "click" distances to the target its a single "ease out" animation
        //    Otherwise the press animation does a linear scroll animation to (targetPoistion - clickDistance)
        //    And the last "click" distance is then a "ease out" animation

        let stopped = false;
        let stopPressAnimation = noop;
        const clickScrollMs = 180;
        const pressLinearMs = 90;
        const pressOutMs = 250;
        const clickPressDelayMs = 150;
        const [setPressAnimationTimeout, clearPressAnimationTimeout] =
          selfClearTimeout(clickPressDelayMs);
        const beforeClickHandleOffset = getHandleOffset();
        const targetDeltaMovementSign = Math.sign(targetDeltaMovement);
        const clickScrollDistance = getClientSize(viewport)[isHorizontal ? 'w' : 'h'];
        const easing = (x: number) => 1 - (1 - x) * (1 - x); // easeOutQuad;

        const stopClickAnimation = animateNumber(
          0,
          clickScrollDistance * targetDeltaMovementSign,
          clickScrollMs,
          (clickAnimationProgress, _, clickAnimationCompleted) => {
            scrollRelative(clickAnimationProgress);

            if (clickAnimationCompleted) {
              onClickScrollCompleted(stopped);

              if (stopped) {
                return;
              }

              const afterClickHandleOffset = getHandleOffset();
              const clickScrollHandleDeltaMovement =
                afterClickHandleOffset - beforeClickHandleOffset;
              const remainingTargetOffsetDistance =
                targetDeltaMovement - clickScrollHandleDeltaMovement;
              const remainingClickScrollHandleDeltaMovements =
                targetDeltaMovement / clickScrollHandleDeltaMovement - 1;
              const continueWithPress =
                remainingClickScrollHandleDeltaMovements > 0.5 &&
                Math.sign(remainingTargetOffsetDistance) === targetDeltaMovementSign;

              const isOutAnimation = remainingClickScrollHandleDeltaMovements <= 1.5;
              if (continueWithPress) {
                setPressAnimationTimeout(() => {
                  stopPressAnimation = animateNumber(
                    clickScrollHandleDeltaMovement,
                    isOutAnimation
                      ? targetDeltaMovement
                      : targetDeltaMovement - clickScrollHandleDeltaMovement,
                    isOutAnimation
                      ? pressOutMs
                      : remainingClickScrollHandleDeltaMovements * pressLinearMs,
                    (progress, _, completed) => {
                      moveHandleRelative(progress);

                      if (completed && !isOutAnimation) {
                        stopPressAnimation = animateNumber(
                          progress,
                          targetDeltaMovement,
                          pressOutMs,
                          moveHandleRelative,
                          easing
                        );
                      }
                    },
                    isOutAnimation && easing
                  );
                });
              }
            }
          },
          easing
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
