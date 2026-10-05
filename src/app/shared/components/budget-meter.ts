import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BudgetStatus } from '../../core/models';
import { BUDGET_STATUS_META, progressWidth } from '../../core/utils/budget-display';

/**
 * Budget progress bar with a fixed marker at 75%, the point where a budget turns
 * "near limit". The marker lets people see how close they are before the colour changes.
 */
@Component({
  selector: 'bf-budget-meter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="meter"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      [attr.aria-valuenow]="width()"
      [attr.aria-valuetext]="valueText()"
      [attr.aria-label]="label()"
      [attr.data-tone]="tone()"
    >
      <div class="meter__fill" [style.width.%]="width()"></div>
      <span class="meter__tick" aria-hidden="true"></span>
    </div>
  `,
  styleUrl: './budget-meter.scss',
})
export class BudgetMeter {
  readonly percentageUsed = input.required<number>();
  readonly status = input.required<BudgetStatus>();
  readonly label = input.required<string>();

  protected readonly width = computed(() => progressWidth(this.percentageUsed()));
  protected readonly tone = computed(() => BUDGET_STATUS_META[this.status()].tone);
  protected readonly valueText = computed(
    () => `${this.percentageUsed()}% used, ${BUDGET_STATUS_META[this.status()].label.toLowerCase()}`,
  );
}
