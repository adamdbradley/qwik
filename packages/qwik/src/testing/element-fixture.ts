import { getContext, normalizeOnProp, QContext } from '../core/props/props';
import type { QwikDocument } from '../core/document';
import { fromCamelToKebabCase } from '../core/util/case';
import { createWindow } from './document';
import { getTestPlatform } from './platform';
import type { MockDocument, MockWindow } from './types';
import { getDocument } from '../core/util/dom';
import type { QRLInternal } from '../core/import/qrl-class';
import { getWrappingContainer } from '../core/use/use-core';

/**
 * Creates a simple DOM structure for testing components.
 *
 * By default `EntityFixture` creates:
 *
 * ```
 * <host q:view="./component_fixture.noop">
 *   <child></child>
 * </host>
 * ```
 *
 * @alpha
 *
 */
export class ElementFixture {
  window: MockWindow;
  document: MockDocument;
  superParent: HTMLElement;
  parent: HTMLElement;
  host: HTMLElement;
  child: HTMLElement;

  constructor(options: ElementFixtureOptions = {}) {
    this.window = createWindow();
    this.document = this.window.document;
    this.superParent = this.document.createElement('super-parent');
    this.parent = this.document.createElement('parent');
    this.host = this.document.createElement(options.tagName || 'host');
    this.child = this.document.createElement('child');
    this.superParent.appendChild(this.parent);
    this.parent.appendChild(this.host);
    this.host.appendChild(this.child);
    this.document.body.appendChild(this.superParent);
  }
}

/**
 * @alpha
 */
export interface ElementFixtureOptions {
  tagName?: string;
}

/**
 * Trigger an event in unit tests on an element.
 *
 * @param element
 * @param selector
 * @param event
 * @returns
 */
export async function trigger(
  element: Element,
  selector: string,
  eventNameCamel: string
): Promise<Element[]> {
  const elements: Promise<Element>[] = [];
  Array.from(element.querySelectorAll(selector)).forEach((element) => {
    const kebabEventName = fromCamelToKebabCase(eventNameCamel);
    const qrlAttr = element.getAttribute('on:' + kebabEventName);
    if (qrlAttr) {
      qrlAttr.split('/n').forEach((qrl) => {
        const event = { type: kebabEventName };
        const url = new URL(qrl, 'http://mock-test/');

        // Create a mock document to simulate `qwikloader` environment.
        const previousQDocument: QwikDocument = (globalThis as any).document;
        const document: QwikDocument = ((globalThis as any).document =
          element.ownerDocument as any);
        document.__q_context__ = [element, event, url];
        try {
          const ctx = getContext(element);
          const handler = getEvent(ctx, 'on-' + eventNameCamel);
          if (handler) {
            elements.push(handler());
          } else {
            console.error('handler not available');
          }
        } finally {
          document.__q_context__ = undefined;
          (globalThis as any).document = previousQDocument;
        }
      });
    }
  });
  await getTestPlatform(getDocument(element)).flush();
  return Promise.all(elements);
}

export function getEvent(ctx: QContext, prop: string): any {
  return qPropReadQRL(ctx, normalizeOnProp(prop));
}

export function qPropReadQRL(ctx: QContext, prop: string): ((event: Event) => void) | null {
  const listeners = !ctx.li ? (ctx.li = new Map<string, QRLInternal<any>[]>()) : ctx.li;

  const containerEl = getWrappingContainer(ctx.$element$)!;
  return async (event) => {
    const qrls = listeners.get(prop) ?? [];

    await Promise.all(
      qrls.map((qrl) => {
        qrl.$setContainer$(containerEl);
        return qrl(event);
      })
    );
  };
}
