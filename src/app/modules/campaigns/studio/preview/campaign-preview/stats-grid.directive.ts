import { AfterViewInit, Directive, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, inject } from '@angular/core';
import { StatsBlockData } from '../../../services/campaign-studio-state.service';
import { StatsLayoutInfo, statsPlacement } from '../../../utils/stats-visual-layout';

@Directive({selector:'[hmStatsGrid]',standalone:true})
export class StatsGridDirective implements AfterViewInit, OnChanges, OnDestroy {
  @Input({required:true}) hmStatsGrid!: StatsBlockData;
  @Output() statsLayoutChange = new EventEmitter<StatsLayoutInfo>();
  private host = inject(ElementRef<HTMLElement>);
  private observer?: ResizeObserver;
  private dead = false;
  private report = '';
  ngAfterViewInit(): void {
    if(typeof ResizeObserver !== 'undefined') { this.observer = new ResizeObserver(()=>this.render());this.observer.observe(this.host.nativeElement); }
    this.render();
  }
  ngOnChanges(): void { queueMicrotask(()=>{if(!this.dead)this.render();}); }
  ngOnDestroy(): void { this.dead=true;this.observer?.disconnect(); }
  private render(): void {
    const grid=this.host.nativeElement;
    if(!this.hmStatsGrid || !grid.clientWidth) return;
    const info=statsPlacement(this.hmStatsGrid,grid.clientWidth);
    grid.style.gridTemplateColumns=`repeat(${info.columns}, minmax(0,1fr))`;
    grid.style.gridTemplateRows=`repeat(${info.rows}, minmax(60px, auto))`;
    grid.dataset['effectiveColumns']=String(info.columns);grid.dataset['effectiveRows']=String(info.rows);
    for(const el of Array.from(grid.children) as HTMLElement[]) {
      const cell=info.cells.find(c=>c.key===el.dataset['statKey']);
      if(cell){el.style.gridColumn=`${cell.column} / span ${cell.columns}`;el.style.gridRow=`${cell.row} / span ${cell.rows}`;}
    }
    const report=JSON.stringify(info);
    if(report!==this.report){this.report=report;queueMicrotask(()=>{if(!this.dead)this.statsLayoutChange.emit(info);});}
  }
}
