import { Component, ViewChild, ChangeDetectorRef } from '@angular/core';
import { OverlayScrollbars } from 'overlayscrollbars';
import { OverlayScrollbarsComponent, OverlayscrollbarsModule } from 'overlayscrollbars-ngx';
import type { EventListeners } from 'overlayscrollbars';
import { eventObserver } from './eventObserver';
import { CommonModule } from '@angular/common';

const initBodyOverlayScrollbars = (force?: boolean) =>
  OverlayScrollbars(
    {
      target: document.body,
      cancel: {
        body: force ? false : null,
      },
    },
    {
      scrollbars: {
        theme: 'os-theme-light',
        clickScroll: true,
      },
    },
  ).state().destroyed;

@Component({
  selector: 'app-root',
  imports: [OverlayscrollbarsModule, CommonModule],
  templateUrl: './app.html',
})
export class App {
  contentHidden = false;
  elementHidden = false;
  useOverlayScrollbars = true;
  useBodyOverlayScrollbars: boolean | null = null;
  options = {
    scrollbars: {
      theme: 'os-theme-light',
    },
  };
  events: EventListeners;
  observedEvents$: ReturnType<typeof eventObserver>[0];

  @ViewChild('osRef', { read: OverlayScrollbarsComponent })
  osRef?: OverlayScrollbarsComponent;

  constructor(cdr: ChangeDetectorRef) {
    const [observedEvents, activateEvent] = eventObserver(cdr);
    this.events = {
      initialized: () => activateEvent('initialized'),
      destroyed: () => activateEvent('destroyed'),
      updated: () => activateEvent('updated'),
      scroll: () => activateEvent('scroll'),
    };
    this.observedEvents$ = observedEvents;
  }

  scrollContent() {
    const osInstance = this.osRef?.osInstance();

    if (!osInstance) {
      return;
    }

    const { overflowAmount } = osInstance.state();
    const { scrollOffsetElement } = osInstance.elements();
    const { scrollLeft, scrollTop } = scrollOffsetElement;

    scrollOffsetElement.scrollTo({
      behavior: 'smooth',
      left: Math.round((overflowAmount.x - scrollLeft) / overflowAmount.x) * overflowAmount.x,
      top: Math.round((overflowAmount.y - scrollTop) / overflowAmount.y) * overflowAmount.y,
    });
  }

  toggleContent() {
    this.contentHidden = !this.contentHidden;
  }

  toggleElement() {
    this.elementHidden = !this.elementHidden;
  }

  toggleBodyOverlayScrollbars() {
    const bodyOsInstance = OverlayScrollbars(document.body);
    if (bodyOsInstance) {
      bodyOsInstance.destroy();
      this.useBodyOverlayScrollbars = false;
    } else {
      this.useBodyOverlayScrollbars = !initBodyOverlayScrollbars(true);
    }
  }

  ngOnInit() {
    this.useBodyOverlayScrollbars = !initBodyOverlayScrollbars();
  }

  originalOrder() {
    return 0;
  }
}
