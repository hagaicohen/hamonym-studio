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

  beforeEach(async () => {
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
    finance = jasmine.createSpyObj('FinanceOpsService', ['listMasavProposals', 'getStatementBalance', 'approveMasavProposal', 'exportMasavProposals', 'previewMasavExport', 'recordMasavResult', 'listMasavInstructions', 'finalizeMasavInstruction', 'prepareMasavRetry']);
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
    fixture = TestBed.createComponent(MasavCollectionSectionComponent); component = fixture.componentInstance;
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
    await render(); expect(component.rows[0].proposal?.id).toBe('retry-proposal'); expect(button('אשר הצעה')).toBeTruthy();
  });

  it('keeps historical November debt visible in December with no proposal or current donations', async () => {
    await render();
    expect(text()).toContain('גביית מס״ב'); expect(text()).toContain('דצמבר 2026'); expect(text()).toContain('נובמבר 2026');
    expect(text()).toContain('ממתין להכנת הצעה'); expect(component.totalOutstanding).toBe(540); expect(component.organizationCount).toBe(1);
    expect(billing.listStatements).toHaveBeenCalledWith({}); expect(button('ההצעה טרם הוכנה').disabled).toBeTrue();
    expect(finance.approveMasavProposal).not.toHaveBeenCalled(); expect(finance.exportMasavProposals).not.toHaveBeenCalled();
  });
  it('shows a direct settings link for absent or unapproved authorization', async () => {
    config = null; await render(); expect(text()).toContain('נדרשת השלמת פרטי מס״ב');
    expect(fixture.nativeElement.querySelector('a.masav-button').getAttribute('href')).toBe('/platform/billing-setup/entity-1');
    config = { ...config!, authorized: false } as MasavConfig; component.refresh(); await render();
    expect(component.rows[0].state).toBe('authorization'); expect(button('אשר הצעה')).toBeUndefined();
  });
  it('completes explicit approval and Excel export through existing APIs, without marking debt paid', async () => {
    proposals = [proposal('proposed')]; await render(); button('אשר הצעה').click(); await render();
    expect(button('אישור הצעה').disabled).toBeTrue(); component.approvalReason = 'אישור ידני להפקת קובץ'; await render();
    button('אישור הצעה').click(); await render(); expect(finance.approveMasavProposal).toHaveBeenCalledOnceWith('proposal-1', component.approvalReason);
    expect(text()).toContain('הפק קובץ Excel למס״ב'); button('הפק קובץ Excel למס״ב').click(); await render();
    expect(finance.exportMasavProposals).not.toHaveBeenCalled(); button('אישור והורדת הקובץ המאוחד').click(); await render();
    expect(finance.exportMasavProposals).toHaveBeenCalledOnceWith(['proposal-1'], 'test-token'); expect(component.saveFile).toHaveBeenCalledTimes(1);
    expect(text()).toContain('קובץ הופק — ממתין לתוצאות גבייה'); expect(component.totalOutstanding).toBe(540);
    expect(statements[0].status).toBe('open'); expect(button('הפק קובץ Excel למס״ב').disabled).toBeTrue();
  });
  it('prevents duplicate approval requests while a request is pending', async () => {
    proposals = [proposal('proposed')]; const pending = new Subject<{ result: unknown }>(); finance.approveMasavProposal.and.returnValue(pending);
    await render(); const row = component.rows[0]; component.beginApproval(row); component.approvalReason = 'אישור'; component.approve(row); component.approve(row);
    expect(finance.approveMasavProposal).toHaveBeenCalledTimes(1); expect(component.busy).toBeTrue();
    pending.next({ result: { approved: true } }); pending.complete(); expect(component.busy).toBeFalse();
  });
  it('prevents duplicate exports and never automatically exports an approved proposal', async () => {
    proposals = [proposal('approved')]; const pending = new Subject<Blob>(); finance.exportMasavProposals.and.returnValue(pending);
    await render(); expect(finance.exportMasavProposals).not.toHaveBeenCalled(); const row = component.rows[0]; component.openExportPreview(); component.exportPreview(); component.exportPreview();
    expect(finance.exportMasavProposals).toHaveBeenCalledTimes(1); proposals = [proposal('exported')]; pending.next(new Blob(['xlsx'])); pending.complete();
    expect(component.totalOutstanding).toBe(540); expect(component.rows[0].state).toBe('exported');
  });
  it('shows completion only after paid status and confirmed MASAV collection', async () => {
    proposals = [proposal('exported')]; statements[0].status = 'paid'; statements[0].confirmed_collection_methods = ['card', 'masav']; balance = 0;
    await render(); expect(text()).toContain('הגבייה הושלמה'); expect(component.totalOutstanding).toBe(0); expect(component.organizationCount).toBe(0);
  });
  it('does not double count repeated statement/proposal records or multiple periods of one organization', async () => {
    statements = [statements[0], statements[0], { ...statements[0], id: 'older-statement' }]; proposals = [proposal('proposed'), proposal('proposed')];
    await render(); expect(component.rows.length).toBe(2); expect(component.organizationCount).toBe(1); expect(component.totalOutstanding).toBe(1080);
    expect(billing.getMasavConfig).toHaveBeenCalledTimes(1);
  });
  it('shows a real preparation failure and prevents actions while an attempt is unresolved', async () => {
    job.status = 'failed'; job.resultSummary = { results: [{ statementId: 'statement-1', reason: 'collection_held' }] };
    await render(); expect(text()).toContain('חסימת גבייה'); expect(component.rows[0].state).toBe('blocked');
    proposals = [proposal('approved')]; statements[0].latest_attempt_status = 'ambiguous'; component.refresh(); await render();
    expect(text()).toContain('טרם הוכרע'); expect(button('הפק קובץ Excel למס״ב').disabled).toBeTrue();
  });
  it('does not misrepresent an old authorization failure as a currently missing mandate', async () => {
    job.status = 'failed'; job.resultSummary = { results: [{ statementId: 'statement-1', reason: 'masav_not_authorized' }] };
    await render(); expect(component.rows[0].state).toBe('waiting'); expect(text()).toContain('ההרשאה מאושרת כעת');
  });
  it('does not approve stale amounts and respects a backend rejection of approval', async () => {
    proposals = [{ ...proposal('proposed'), proposed_amount: '600' }]; await render(); expect(component.rows[0].state).toBe('waiting');
    proposals = [proposal('proposed')]; component.refresh(); await render(); finance.approveMasavProposal.and.returnValue(of({ result: { approved: false, reason: 'outstanding_changed' } }));
    const row = component.rows[0]; component.beginApproval(row); component.approvalReason = 'אישור'; component.approve(row); await render();
    expect(text()).toContain('ההצעה לא אושרה'); expect(finance.exportMasavProposals).not.toHaveBeenCalled();
  });
  it('shows unknown data as an error, not zero debt or green success', async () => {
    finance.getStatementBalance.and.returnValue(throwError(() => new Error('unavailable'))); await render();
    expect(component.incomplete).toBeTrue(); expect(text()).toContain('לא ניתן לאמת'); expect(component.requiresFollowUp).toBeTrue();
    billing.listStatements.and.returnValue(throwError(() => new Error('unavailable'))); component.refresh(); await render();
    expect(component.error).toBeTruthy(); expect(text()).not.toContain('אין יתרות מס״ב פתוחות'); expect(component.loading).toBeFalse();
  });
  it('has a permanent neutral empty state and never starts financial actions on load', async () => {
    statements = []; await render(); expect(text()).toContain('גביית מס״ב'); expect(text()).toContain('אין יתרות מס״ב פתוחות');
    expect(component.organizationCount).toBe(0); expect(finance.approveMasavProposal).not.toHaveBeenCalled(); expect(finance.exportMasavProposals).not.toHaveBeenCalled();
  });
  it('keeps export timeout distinct from collection success and reloads the actual status', async () => {
    proposals = [proposal('approved')]; finance.exportMasavProposals.and.callFake(() => { proposals = [proposal('exported')]; return throwError(() => new Error('timeout')); });
    await render(); const row = component.rows[0]; component.openExportPreview(); component.exportPreview(); await render();
    expect(text()).toContain('לא התקבל קובץ Excel'); expect(component.rows[0].state).toBe('exported'); expect(component.busy).toBeFalse(); expect(component.saveFile).not.toHaveBeenCalled();
  });
  it('never offers approval of a newer duplicate while an earlier exported instruction is unresolved', async () => {
    proposals = [{ ...proposal('proposed'), id: 'newer', created_at: '2026-10-30T10:00:00Z' }, proposal('exported')];
    await render(); expect(component.rows[0].state).toBe('exported'); expect(button('אשר הצעה')).toBeUndefined();
  });
  it('keeps rows and actions readable without horizontal overflow at mobile and desktop widths', async () => {
    proposals = [proposal('approved')];
    finance.listMasavInstructions.and.returnValue(of({ instructions: [instructionFixture({ id: '12345678-1234-1234-1234-123456789012' })] }));
    await render(); component.beginResult(component.instructions[0], 'finalize'); await render();
    const frame = document.createElement('iframe'); frame.style.border = '0'; document.body.appendChild(frame);
    try {
      const styles = Array.from(document.head.querySelectorAll('style')).map(style => style.outerHTML).join('');
      frame.contentDocument!.open(); frame.contentDocument!.write(`<html dir="rtl"><head>${styles}</head><body style="margin:0">${fixture.nativeElement.outerHTML}</body></html>`); frame.contentDocument!.close();
      for (const width of [375, 1200]) {
        frame.style.width = width + 'px';
        const section = frame.contentDocument!.querySelector('.masav-section') as HTMLElement;
        expect(section.scrollWidth).withContext('MASAV section at width ' + width).toBeLessThanOrEqual(width);
        const action = frame.contentDocument!.querySelector('button.primary') as HTMLElement;
        expect(action.getBoundingClientRect().width).toBeGreaterThan(100);
      }
    } finally { frame.remove(); }
  });
  it('previews and exports all reviewed organizations and periods together in one request', async () => {
    proposals = [proposal('approved')];
    finance.previewMasavExport.and.returnValue(of({ preview: { mode: 'entity', previewToken: 'all-debts-token', totalAmount: '2160.00', organizationCount: 2, periodCount: 3, excluded: [], instructions: [
      { ordinal: 1, entityId: 'entity-1', entityName: 'עמותה ראשונה', amount: '1620', bankLast4: '1234', components: ['nov', 'dec', 'jan'].map((id, index) => ({ proposalId: id, statementId: id, periodId: id, periodStart: `2026-${index + 8}-28T18:00:00Z`, periodEnd: '2026-11-28T18:00:00Z', amount: '540' })) },
      { ordinal: 2, entityId: 'entity-2', entityName: 'עמותה שנייה', amount: '540', bankLast4: '5678', components: [{ proposalId: 'second', statementId: 'second', periodId: 'nov', periodStart: period.period_start, periodEnd: period.period_end, amount: '540' }] },
    ] } }));
    await render(); component.openExportPreview(); await render();
    expect(text()).toContain('2,160.00'); expect(text()).toContain('עמותה שנייה'); expect(text()).toContain('1,620.00');
    expect(finance.exportMasavProposals).not.toHaveBeenCalled(); component.exportPreview();
    expect(finance.exportMasavProposals).toHaveBeenCalledOnceWith(['nov', 'dec', 'jan', 'second'], 'all-debts-token');
  });
  it('does not fabricate a preview if its API is unavailable', async () => {
    proposals = [proposal('approved')]; finance.previewMasavExport.and.returnValue(throwError(() => new Error('unavailable')));
    await render(); component.openExportPreview(); await render();
    expect(component.preview).toBeNull(); expect(component.previewBusy).toBeFalse(); expect(text()).toContain('לא ניתן להכין תצוגה מקדימה');
    component.exportPreview(); expect(finance.exportMasavProposals).not.toHaveBeenCalled();
  });
  it('requires a new review if the backend detects a changed consolidation mode or balance', async () => {
    proposals = [proposal('approved')]; finance.exportMasavProposals.and.returnValue(throwError(() => ({ error: { code: 'MASAV_PREVIEW_CHANGED' } })));
    await render(); component.openExportPreview(); component.exportPreview(); await render();
    expect(component.preview).toBeNull(); expect(text()).toContain('יש להכין תצוגה מקדימה חדשה'); expect(component.saveFile).not.toHaveBeenCalled();
  });
});
