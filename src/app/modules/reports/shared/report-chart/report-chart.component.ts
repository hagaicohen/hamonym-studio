import { Component, ElementRef, Input, OnChanges, AfterViewInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

export interface ReportChartDataset {
  label: string;
  data: number[];
  color: string | string[];
}

@Component({
  selector: 'app-report-chart',
  standalone: true,
  imports: [CommonModule],
  template: `<div class="report-chart-wrap" [style.height.px]="height"><canvas #canvas></canvas></div>`,
  styles: [`
    .report-chart-wrap { position: relative; width: 100%; }
  `],
})
export class ReportChartComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() labels: string[] = [];
  @Input() datasets: ReportChartDataset[] = [];
  @Input() horizontal = false;
  @Input() height = 260;
  @Input() moneyFormat = true;

  @ViewChild('canvas') private canvasRef!: ElementRef<HTMLCanvasElement>;

  private chart: Chart | null = null;
  private viewReady = false;

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.buildChart();
  }

  ngOnChanges(): void {
    if (this.viewReady) this.buildChart();
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  private buildChart(): void {
    if (!this.canvasRef?.nativeElement) {
      setTimeout(() => this.buildChart(), 0);
      return;
    }
    if (this.chart) { this.chart.destroy(); this.chart = null; }
    if (this.labels.length === 0) return;

    const ctx = this.canvasRef.nativeElement.getContext('2d')!;
    const formatCompact = (n: number) => {
      if (!this.moneyFormat) return String(n);
      if (n >= 1_000_000) return `₪${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
      if (n >= 1_000)     return `₪${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
      return `₪${n}`;
    };

    this.chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: this.labels,
        datasets: this.datasets.map((ds) => ({
          label: ds.label,
          data: ds.data,
          backgroundColor: ds.color,
          borderRadius: 4,
          maxBarThickness: 36,
        })),
      },
      options: {
        indexAxis: this.horizontal ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: this.datasets.length > 1, position: 'top', labels: { font: { size: 12 } } },
          tooltip: {
            callbacks: {
              label: (item) => `${item.dataset.label}: ${formatCompact(Number(item.raw))}`,
            },
          },
        },
        scales: {
          x: this.horizontal
            ? { beginAtZero: true, grid: { display: true }, ticks: { font: { size: 11 }, precision: this.moneyFormat ? undefined : 0, callback: (v) => formatCompact(Number(v)) } }
            : { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: this.horizontal
            ? { position: 'left', grid: { display: false }, ticks: { font: { size: 11 } } }
            : { position: 'right', beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 }, precision: this.moneyFormat ? undefined : 0, callback: (v) => formatCompact(Number(v)) } },
        },
      },
    });
  }
}
