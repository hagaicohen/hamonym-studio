import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';

type Pane = 'tree' | 'preview' | 'inspector';

/** Replaces legacy scripts 044/046: the tabs and their state are owned by Angular. */
@Component({
  selector: 'ham-mobile-workspace-tabs', standalone: true,
  templateUrl: './mobile-workspace-tabs.component.html',
  styleUrl: './mobile-workspace-tabs.component.css'
})
export class MobileWorkspaceTabsComponent implements OnInit, OnDestroy {
  pane: Pane = 'preview';
  manager = false;
  private manuallyChosen = false;
  private observer?: MutationObserver;
  private readonly breakpoint = window.matchMedia('(max-width:700px)');
  private readonly onBreakpoint = () => this.sync();
  private readonly onWorkspaceClick = (event: Event) => {
    if (!this.breakpoint.matches) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (this.manager && target.closest('.hu-menu button,.hu-menu [data-hu-section],.hu-menu [role="button"]')) {
      this.choose('inspector');
    } else if (!this.manager && target.closest('#sectionList .section-item')) {
      this.choose('inspector');
    }
    if (this.manager || !target.closest('.canvas')) return;
    if (target.closest('button,a,input,textarea,select,label,[contenteditable="true"]')) return;
    const item = target.closest('.editable,[data-part]');
    if (item && item.id !== 'preview' && !item.classList.contains('preview')) {
      requestAnimationFrame(() => this.choose('inspector'));
    }
  };
  private readonly onWorkspaceDismiss = (event: Event) => {
    if (!this.breakpoint.matches || this.pane !== 'inspector' || this.manager) return;
    const target = event.target;
    if (target instanceof Element && target.closest('.stage') && !target.closest('.inspector')) this.choose('preview');
  };
  constructor(private cdr: ChangeDetectorRef) {}
  get options(): {id: Pane; label: string}[] {
    return this.manager
      ? [{id:'tree',label:'תוכן'},{id:'inspector',label:'עריכה'},{id:'preview',label:'תצוגה'}]
      : [{id:'tree',label:'רכיבים'},{id:'preview',label:'תצוגה'},{id:'inspector',label:'מאפיינים'}];
  }
  get workspace(): HTMLElement | null { return document.querySelector('.workspace'); }
  ngOnInit(): void {
    const workspace = this.workspace;
    if (!workspace) return;
    this.manager = workspace.classList.contains('hu-management-mode');
    this.observer = new MutationObserver(() => {
      const next = workspace.classList.contains('hu-management-mode');
      if (next !== this.manager) {
        this.manager = next;
        this.manuallyChosen = false;
        this.pane = next ? 'tree' : 'preview';
        this.sync();
      }
    });
    this.observer.observe(workspace, {attributes:true,attributeFilter:['class']});
    this.breakpoint.addEventListener('change', this.onBreakpoint);
    workspace.addEventListener('click',this.onWorkspaceClick);
    workspace.addEventListener('click',this.onWorkspaceDismiss);
    this.sync();
  }
  choose(pane: Pane): void {
    this.manuallyChosen = true;
    this.pane = pane;
    this.sync();
    document.dispatchEvent(new CustomEvent('ham:mobile-pane-change',{detail:{pane}}));
  }
  sync(): void {
    const workspace = this.workspace;
    if (!workspace) return;
    if (!this.breakpoint.matches) workspace.removeAttribute('data-ham-mobile-pane');
    else {
      if (!this.manuallyChosen && this.manager && this.pane === 'preview') this.pane = 'tree';
      if (!this.manuallyChosen && !this.manager && this.pane === 'tree') this.pane = 'preview';
      workspace.dataset['hamMobilePane'] = this.pane;
    }
    this.cdr.detectChanges();
  }
  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.breakpoint.removeEventListener('change',this.onBreakpoint);
    this.workspace?.removeEventListener('click',this.onWorkspaceClick);
    this.workspace?.removeEventListener('click',this.onWorkspaceDismiss);
  }
}
