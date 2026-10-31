import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { MasavCollectionSectionComponent } from './masav-collection-section.component';
import { BillingOpsService, BillingPeriod, MasavConfig, StatementListItem } from '../../services/billing-ops.service';
import { FinanceOpsService, MasavProposal, MasavInstruction } from '../../services/finance-ops.service';
import { CollectionOpsService, JobActivity } from '../../services/collection-ops.service';
import { SimulationClockService } from '../../services/simulation-clock.service';

describe('permanent MASAV workflow', () => {
  let fixture: ComponentFixture<MasavCollectionSectionComponent>;
  let component: MasavCollectionSectionComponent;
  let statements: StatementListItem[], proposals: MasavProposal[], balance: number;
  let config: MasavConfig | null;
  let job: JobActivity;
  let finance: jasmine.SpyObj<FinanceOpsService>, billing: jasmine.SpyObj<BillingOpsService>;
  const period: BillingPeriod = { id: 'november', period_start: '2026-10-28T18:00:00Z', period_end: '2026-11-28T18:00:00Z', created_at: '', retired: false, run_count: 1 };
  const proposal = (status: MasavProposal['status']): MasavProposal => ({
    id: 'proposal-1', statement_id: 'statement-1', entity_id: 'entity-1', proposed_amount: '540', outstanding_at_proposal: '540', status,
    status_reason: null, created_at: '2026-10-30T09:30:00Z', approved_at: null, exported_at: null,
    entity_name: 'עמותת בדיקה', total_due: '3540', statement_status: 'open', period_start: period.period_start, period_end: period.period_end,
  });
  const text = () => fixture.nativeElement.textContent as string;
  const button = (label: string): HTMLButtonElement => Array.from(fixture.nativeElement.querySelectorAll('button')).find((node: unknown) => (node as HTMLButtonElement).textContent?.trim() === label) as HTMLButtonElement;
  async function render(): Promise<void> { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); }
  async function waitForDownload(): Promise<void> {
    for (let attempt = 0; component.busy && attempt < 200; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(component.busy).withContext('asynchronous error body parsing must terminate').toBeFalse();
    await render();
  }

  beforeEach(async () => {
    sessionStorage.removeItem('masav-download-request');
    balance = 540; proposals = [];
    statements = [{ id: 'statement-1', billing_account_id: 'account-1', billing_period_id: 'november', billing_run_id: 'run-1',
      gross_raised: '100000', fee_amount: '3000', vat_amount: '540', total_due: '3540', status: 'open', created_at: '', entity_id: 'entity-1',
      entity_name: 'עמותת בדיקה', routed_method: 'card', latest_attempt_status: 'succeeded', payment_count: 1, collected: '3000',
      confirmed_collection_methods: ['card'], outstanding: '540', next_action: '',
    }];
    config = { id: 'mandate', entity_id: 'entity-1', bank_code: '12', branch_code: '345', account_number: 'isolated-only', account_holder_name: null,
      authorized: true, authorized_by: '1', authorized_at: '', authorization_document_name: null, authorization_document_uploaded_at: null,
      has_authorization_document: false, created_at: '', updated_at: '',
    };
    job = { name: 'fin11-masav-prepare', label: '', registered: true, status: 'success', resultSummary: { results: [] } };
    finance = jasmine.createSpyObj('FinanceOpsService', ['getMasavExportSummary', 'approveAndDownloadMasav', 'listMasavProposals', 'getStatementBalance', 'approveMasavProposal', 'exportMasavProposals', 'previewMasavExport', 'recordMasavResult', 'listMasavInstructions', 'finalizeMasavInstruction', 'prepareMasavRetry']);
    finance.getMasavExportSummary.and.callFake(() => of({ summary: { mode: 'entity', previewToken: 'a'.repeat(64), totalAmount: proposals.filter(p => ['approved','proposed'].includes(p.status)).reduce((n,p) => n + Number(p.proposed_amount),0).toFixed(2), organizationCount: 1, periodCount: 1, excluded: [], instructions: proposals.filter(p => ['approved','proposed'].includes(p.status)).map((p,index) => ({ordinal:index+1,entityId:p.entity_id,entityName:p.entity_name,amount:p.proposed_amount,bankLast4:'1234',components:[]})) } }));
    finance.approveAndDownloadMasav.and.callFake(() => { proposals = [proposal('exported')]; return of(new Blob(['isolated xlsx'])); });
    finance.listMasavInstructions.and.returnValue(of({ instructions: [] }));
    billing = jasmine.createSpyObj('BillingOpsService', ['listStatements', 'listPeriods', 'getMasavConfig']);
    finance.listMasavProposals.and.callFake(() => of({ proposals }));
    finance.previewMasavExport.and.callFake(() => of({ preview: { mode: 'entity', previewToken: 'test-token', totalAmount: '540', organizationCount: 1, periodCount: 1, excluded: [],
      instructions: proposals.filter(p => p.status === 'approved').map((p,index) => ({ ordinal:index+1,entityId:p.entity_id,entityName:p.entity_name,amount:p.proposed_amount,bankLast4:'1234',components:[{proposalId:p.id,statementId:p.statement_id,periodId:period.id,periodStart:p.period_start,periodEnd:p.period_end,amount:p.proposed_amount}]})),
    } }));
    finance.getStatementBalance.and.callFake(() => of({ balance: { originalTotal: 3540, adjustedTotal: 3540, collected: 3540 - balance, outstanding: balance } }));
    finance.approveMasavProposal.and.callFake(() => { proposals = [proposal('approved')]; return of({ result: { approved: true } }); });
    finance.exportMasavProposals.and.callFake(() => { proposals = [proposal('exported')]; return of(new Blob(['isolated xlsx fixture'])); });
    billing.listStatements.and.callFake(() => of({ statements }));
    billing.listPeriods.and.returnValue(of({ periods: [period] }));
    billing.getMasavConfig.and.callFake(() => of({ config }));
    await TestBed.configureTestingModule({ imports: [MasavCollectionSectionComponent], providers: [provideRouter([]),
      { provide: BillingOpsService, useValue: billing }, { provide: FinanceOpsService, useValue: finance },
      { provide: CollectionOpsService, useValue: { getSystemActivity: () => of({ automatic: [job], fin11Planned: [] }) } },
      { provide: SimulationClockService, useValue: { getStatus: () => of({ businessNow: '2026-12-06T07:00:00Z' }) } },
    ] }).compileComponents();
    fixture = TestBed.createComponent(MasavCollectionSectionComponent); component = fixture.componentInstance; component.showResults = true;
    spyOn(component, 'saveFile');
  });

  it('requires explicit actual-payment confirmation before recording a result', async () => {
    await render();
    component.resultInstruction = 'instruction'; component.resultAmount = '900'; component.resultReference = 'bank-900'; component.resultConfirmedAt = '2027-01-06T09:00';
    component.recordResult();
    expect(finance.recordMasavResult).not.toHaveBeenCalled();
    finance.recordMasavResult.and.returnValue(of({ result: { id: 'result', allocations: [{ statementId: 'nov', amount: '540.00' }, { statementId: 'dec', amount: '360.00' }] } }));
    component.resultConfirmed = true; component.recordResult();
    expect(finance.recordMasavResult).toHaveBeenCalledTimes(1);
    expect(component.resultMessage).toContain('540.00'); expect(component.resultMessage).toContain('360.00');
    expect(component.busy).toBeFalse();
  });

  it('keeps result details available after a rejected result submission', async () => {
    await render();
    component.resultInstruction = 'instruction'; component.resultAmount = '900'; component.resultReference = 'bank-900'; component.resultConfirmedAt = '2027-01-06T09:00'; component.resultConfirmed = true;
    finance.recordMasavResult.and.returnValue(throwError(() => new Error('conflict')));
    component.recordResult();
    expect(component.resultInstruction).toBe('instruction'); expect(component.resultAmount).toBe('900'); expect(component.busy).toBeFalse(); expect(component.actionError).toBeTruthy();
  });

  const instructionFixture = (overrides: Partial<MasavInstruction> = {}): MasavInstruction => ({
    id: 'instruction-1', entity_name: 'עמותת בדיקה', total_amount: '1620', collected_amount: '900', outstanding_amount: '720',
    status: 'partial', finalized: false, retry_eligible: false, retry_requested: false, parent_instruction_ids: [], allocations: [],
    components: [{ statement_id: 'statement-1', billing_period_id: 'november', period_start: period.period_start, period_end: period.period_end, amount: '540', collected_amount: '540', outstanding_amount: '0' }], ...overrides,
  });

  it('shows original, collected and outstanding instruction amounts without allowing an unfinished retry', async () => {
    finance.listMasavInstructions.and.returnValue(of({ instructions: [instructionFixture()] }));
    await render();
    const history = fixture.nativeElement.querySelector('[data-instruction-id="instruction-1"]') as HTMLElement;
    expect(history.textContent).toContain('1,620'); expect(history.textContent).toContain('900'); expect(history.textContent).toContain('720');
    expect(history.textContent).toContain('התוצאות טרם נסגרו'); expect(history.textContent).not.toContain('הכן גבייה חוזרת ליתרה');
    component.retryInstruction = 'instruction-1'; component.confirmRetry(); expect(finance.prepareMasavRetry).not.toHaveBeenCalled();
  });

  it('requires explicit retry confirmation and keeps preparation separate from approval/export/payment', async () => {
    finance.listMasavInstructions.and.returnValue(of({ instructions: [instructionFixture({ finalized: true, retry_eligible: true })] }));
    finance.prepareMasavRetry.and.returnValue(of({ result: { replayed: false, proposals: [{ id: 'retry-proposal' }] } }));
    await render(); button('הכן גבייה חוזרת ליתרה').click(); await render();
    expect(finance.prepareMasavRetry).not.toHaveBeenCalled(); expect(text()).toContain('₪720.00');
    button('אישור הכנת הצעה ליתרה').click(); await render();
    expect(finance.prepareMasavRetry).toHaveBeenCalledOnceWith('instruction-1');
    expect(finance.exportMasavProposals).not.toHaveBeenCalled(); expect(finance.recordMasavResult).not.toHaveBeenCalled(); expect(finance.approveMasavProposal).not.toHaveBeenCalled();
  });

  it('finalizes a failed collection without recording an invented payment', async () => {
    finance.listMasavInstructions.and.returnValue(of({ instructions: [instructionFixture({ status: 'pending', collected_amount: '0', outstanding_amount: '1620' })] }));
    finance.finalizeMasavInstruction.and.returnValue(of({ result: { outcome: 'failed' } }));
    await render(); button('סיום רישום התוצאות').click(); await render();
    component.resultReference = 'bank-failed'; component.resultConfirmedAt = '2027-01-06T10:00';
    component.recordResult(); expect(finance.finalizeMasavInstruction).not.toHaveBeenCalled();
    component.resultConfirmed = true; component.recordResult();
    expect(finance.finalizeMasavInstruction).toHaveBeenCalledTimes(1); expect(finance.recordMasavResult).not.toHaveBeenCalled();
  });

  it('shows failed and completed histories without offering duplicate or completed retries', async () => {
    finance.listMasavInstructions.and.returnValue(of({ instructions: [instructionFixture({ status: 'failed', finalized: true, collected_amount: '0', retry_requested: true }), instructionFixture({ id: 'completed', status: 'completed', finalized: true, collected_amount: '1620', outstanding_amount: '0' })] }));
    await render(); expect(text()).toContain('גבייה נכשלה'); expect(text()).toContain('הגבייה הושלמה'); expect(text()).not.toContain('הכן גבייה חוזרת ליתרה');
  });

  it('never reports all-clear while a fully recorded instruction is awaiting finalization', async () => {
    balance = 0; statements[0].status = 'paid'; statements[0].confirmed_collection_methods = ['masav'];
    finance.listMasavInstructions.and.returnValue(of({ instructions: [instructionFixture({ status: 'pending', collected_amount: '1620', outstanding_amount: '0' })] }));
    await render(); expect(component.requiresFollowUp).toBeTrue(); expect(component.summaryStatus).toContain('סיום תוצאות');
    expect(button('סיום רישום התוצאות')).toBeTruthy(); expect(button('רישום סכום שנגבה בפועל')).toBeUndefined();
  });

  it('surfaces a retry authorization failure without leaving a loading state', async () => {
    finance.listMasavInstructions.and.returnValue(of({ instructions: [instructionFixture({ finalized: true, retry_eligible: true })] }));
    finance.prepareMasavRetry.and.returnValue(throwError(() => ({ error: { code: 'MASAV_RETRY_BLOCKED_masav_not_authorized' } })));
    await render(); component.retryInstruction = 'instruction-1'; component.confirmRetry(); await render();
    expect(component.busy).toBeFalse(); expect(text()).toContain('נדרשת הרשאת מס״ב מאושרת'); expect(finance.exportMasavProposals).not.toHaveBeenCalled();
  });

  it('selects the current retry proposal instead of an older finalized export', async () => {
    const prior = { ...proposal('exported'), instruction_id: 'instruction-1' };
    proposals = [prior, { ...proposal('proposed'), id: 'retry-proposal', proposed_amount: '180', created_at: '2027-01-06T10:00:00Z' }]; balance = 180;
    finance.listMasavInstructions.and.returnValue(of({ instructions: [instructionFixture({ finalized: true, retry_requested: true })] }));
    await render(); expect(component.rows[0].proposal?.id).toBe('retry-proposal'); expect(button('אשר והורד קובץ מס״ב')).toBeTruthy();
  });


  afterEach(() => sessionStorage.removeItem('masav-download-request'));
  it('renders one action without modal, comment, approval or preview buttons', async () => {
    proposals = [proposal('proposed')]; await render();
    expect(text()).toContain('₪540.00'); expect(button('אשר והורד קובץ מס״ב')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('dialog, textarea, .masav-export-preview')).toBeNull();
    expect(button('אשר הצעה')).toBeUndefined(); expect(finance.approveAndDownloadMasav).not.toHaveBeenCalled();
  });
  it('uses one atomic API call, downloads immediately and refreshes without marking debt paid', async () => {
    proposals = [proposal('proposed')]; await render(); const changed = spyOn(component.changed,'emit');
    button('אשר והורד קובץ מס״ב').click(); await render();
    expect(finance.approveAndDownloadMasav).toHaveBeenCalledTimes(1); expect(component.saveFile).toHaveBeenCalledTimes(1);
    expect(finance.approveMasavProposal).not.toHaveBeenCalled(); expect(finance.exportMasavProposals).not.toHaveBeenCalled();
    expect(finance.previewMasavExport).not.toHaveBeenCalled(); expect(finance.recordMasavResult).not.toHaveBeenCalled();
    expect(text()).toContain('קובץ המס״ב הופק בהצלחה. ממתין לתוצאות הגבייה.');
    expect(component.totalOutstanding).toBe(540); expect(changed).toHaveBeenCalledTimes(1);
  });
  it('prevents duplicate clicks and refresh while preparing a file', async () => {
    proposals = [proposal('proposed')]; const pending = new Subject<Blob>(); finance.approveAndDownloadMasav.and.returnValue(pending); await render();
    component.download(); component.download(); component.refresh(); await render();
    expect(finance.approveAndDownloadMasav).toHaveBeenCalledTimes(1); expect(button('מכין את הקובץ...').disabled).toBeTrue();
    pending.next(new Blob(['xlsx'])); pending.complete(); await render(); expect(component.busy).toBeFalse();
  });
  it('retries a lost response using exactly the same request identity and token', async () => {
    proposals = [proposal('proposed')]; finance.approveAndDownloadMasav.and.returnValue(throwError(() => ({ status: 0 })));
    await render(); component.download(); await render(); const request = finance.approveAndDownloadMasav.calls.mostRecent().args[0];
    expect(component.busy).toBeFalse(); expect(component.downloadRequest).toEqual(request); expect(component.actionError).toContain('לא התקבל קובץ');
    proposals = [proposal('exported')]; component.refresh(); await render();
    finance.approveAndDownloadMasav.and.returnValue(of(new Blob(['same xlsx']))); component.download(); await render();
    expect(finance.approveAndDownloadMasav.calls.mostRecent().args[0]).toEqual(request); expect(component.downloadRequest).toBeNull();
  });
  it('retains the request after a browser download failure', async () => {
    proposals = [proposal('proposed')]; (component.saveFile as jasmine.Spy).and.throwError('download blocked'); await render();
    component.download(); await render(); expect(component.downloadRequest).not.toBeNull(); expect(component.exportNotice).toBe(''); expect(component.busy).toBeFalse();
  });
  it('retains the same request after an ambiguous proxy 503 for safe file recovery', async () => {
    proposals = [proposal('proposed')]; finance.approveAndDownloadMasav.and.returnValue(throwError(() => ({ status: 503, error: new Blob(['upstream unavailable']) })));
    await render(); component.download(); await waitForDownload();
    const request = finance.approveAndDownloadMasav.calls.mostRecent().args[0];
    expect(component.downloadRequest).toEqual(request); expect(component.busy).toBeFalse();
    expect(JSON.parse(sessionStorage.getItem('masav-download-request')!)).toEqual(request);
    finance.approveAndDownloadMasav.and.returnValue(of(new Blob(['recovered xlsx']))); component.download(); await render();
    expect(finance.approveAndDownloadMasav.calls.mostRecent().args[0]).toEqual(request);
  });
  it('clears a stale request and shows an actionable error without claiming success', async () => {
    proposals = [proposal('proposed')]; finance.approveAndDownloadMasav.and.returnValue(throwError(() => ({status:409,error:new Blob([JSON.stringify({code:'MASAV_PREVIEW_CHANGED'})])})));
    await render(); component.download(); await waitForDownload();
    expect(component.downloadRequest).toBeNull(); expect(component.actionError).toContain('היתרות או אופן האיחוד השתנו'); expect(component.exportNotice).toBe('');
  });
  it('blocks the whole export for ineligible instructions and explains the actual blocker', async () => {
    proposals = [proposal('proposed')]; const summary = finance.getMasavExportSummary().subscribe(); summary.unsubscribe();
    finance.getMasavExportSummary.and.returnValue(of({summary:{mode:'entity',previewToken:'a'.repeat(64),totalAmount:'540.00',organizationCount:1,periodCount:1,instructions:[],excluded:[{proposalId:'proposal-1',statementId:'statement-1',entityId:'entity-1',reason:'COLLECTION_HELD'}]}}));
    await render(); expect(text()).toContain('קיימת חסימת גבייה פתוחה'); expect(button('אשר והורד קובץ מס״ב').disabled).toBeTrue();
    component.download(); expect(finance.approveAndDownloadMasav).not.toHaveBeenCalled();
  });
  it('keeps historical debts visible and provides a direct link for missing authorization', async () => {
    config = null; await render(); expect(text()).toContain('נובמבר 2026'); expect(text()).toContain('נדרשת השלמת פרטי מס״ב');
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe('/platform/billing-setup/entity-1'); expect(component.totalOutstanding).toBe(540);
  });
  it('replaces export with pending-results summary and a separate results action', async () => {
    proposals = [proposal('exported')]; finance.listMasavInstructions.and.returnValue(of({instructions:[instructionFixture({total_amount:'540',collected_amount:'0',outstanding_amount:'540',created_at:'2026-12-06T07:00:00Z'})]}));
    component.showResults = false; await render(); expect(button('אשר והורד קובץ מס״ב')).toBeUndefined(); expect(text()).toContain('ממתין לתוצאות הגבייה');
    expect(text()).toContain('תאריך הפקה'); expect(fixture.nativeElement.querySelector('.masav-instruction-history')).toBeNull();
    button('רישום תוצאות הגבייה').click(); await render(); expect(fixture.nativeElement.querySelector('.masav-instruction-history')).not.toBeNull();
  });
  it('fails closed when the new backend summary or schema is unavailable', async () => {
    finance.getMasavExportSummary.and.returnValue(throwError(() => ({status:503}))); await render(); expect(component.error).toBeTruthy(); expect(button('אשר והורד קובץ מס״ב')).toBeUndefined();
    expect(finance.approveAndDownloadMasav).not.toHaveBeenCalled();
  });
  it('does not count historic retry instructions twice in the outstanding total', async () => {
    finance.listMasavInstructions.and.returnValue(of({instructions:[instructionFixture({finalized:true,retry_requested:true}),instructionFixture({id:'retry',total_amount:'720',collected_amount:'0',outstanding_amount:'720'})]}));
    balance=180; await render(); expect(component.totalOutstanding).toBe(180);
  });
  it('makes a finalized partial balance and its confirmed retry accessible from the main card', async () => {
    proposals=[proposal('exported')]; balance=720;
    finance.listMasavInstructions.and.returnValue(of({instructions:[instructionFixture({finalized:true,retry_eligible:true})]}));
    component.showResults=false; await render();
    expect(text()).toContain('גבייה חלקית'); expect(text()).toContain('720.00');
    button('הכן גבייה חוזרת ליתרה').click(); await render();
    expect(component.showResults).toBeTrue(); expect(component.retryInstruction).toBe('instruction-1');
    expect(button('אישור הכנת הצעה ליתרה')).toBeTruthy(); expect(finance.prepareMasavRetry).not.toHaveBeenCalled();
  });
  it('keeps a neutral empty state without financial writes', async () => {
    statements=[]; await render(); expect(text()).toContain('אין יתרות מס״ב פתוחות'); expect(button('אשר והורד קובץ מס״ב').disabled).toBeTrue(); expect(component.requiresFollowUp).toBeFalse();
  });
  it('fits desktop and mobile widths in RTL', async () => {
    proposals=[proposal('proposed')]; await render();
    for(const width of [320,375,1200]) {
      const frame=document.createElement('iframe'); frame.style.width=width+'px'; frame.style.height='700px'; document.body.append(frame);
      const doc=frame.contentDocument!; doc.head.innerHTML=Array.from(document.querySelectorAll('style')).map(s=>s.outerHTML).join(''); doc.body.style.margin='0'; doc.body.innerHTML=fixture.nativeElement.outerHTML;
      await new Promise(resolve=>setTimeout(resolve,10)); const section=doc.querySelector('section')!;
      expect(section.scrollWidth).toBeLessThanOrEqual(width); expect(frame.contentWindow!.getComputedStyle(section).direction).toBe('rtl'); frame.remove();
    }
  });
});
