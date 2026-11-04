export interface DialogOptions<D> {
  data?: D;
  ariaLabelledBy: string;
  panelClass: string;
  width: string;
  maxWidth: string;
}

/** The options every BudgetFlow dialog shares: the app's panel style, a width that fits phones, a labelled title. */
export function dialogOptions<D>(width: number, ariaLabelledBy: string, data?: D): DialogOptions<D> {
  return { data, ariaLabelledBy, panelClass: 'bf-dialog', width: `${width}px`, maxWidth: 'calc(100vw - 2rem)' };
}
