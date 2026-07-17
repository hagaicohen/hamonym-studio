import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { CheckoutModalComponent } from './checkout-modal.component';
import { CampaignStudioStateService, RegistrationOption } from '../../../services/campaign-studio-state.service';
import { AnalyticsService } from '../../../../../core/services/analytics.service';
import { environment } from '../../../../../../environments/environment';

// Multi-Participant Registration checkout — each participant is an
// independent unit (name + one Registration Option + optional shirt size),
// no Schema/Rules engine. See DECISIONS.md (2026-07-15, 2026-07-16,
// 2026-07-17: register-then-donate-later — closing the registration
// checkout without paying remembers participants for a later, separate
// donation checkout to fold in).
describe('CheckoutModalComponent — Registration participants', () => {
  let component: CheckoutModalComponent;
  let httpMock: HttpTestingController;
  const apiUrl = `${environment.apiUrl}/api/donations`;

  const race5k: RegistrationOption = {
    id: 'r1', key: 'RUN_5', title: '5 ק"מ', description: '', price: 50,
  };
  const race10k: RegistrationOption = {
    id: 'r2', key: 'RUN_10', title: '10 ק"מ', description: '', price: 80,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CheckoutModalComponent, HttpClientTestingModule],
    });
    // trackEventThenNavigate does a real window.location.href navigation on
    // success — stub it so a flushed request doesn't crash the test runner
    // with "full page reload".
    spyOn(TestBed.inject(AnalyticsService), 'trackEventThenNavigate');

    const state = TestBed.inject(CampaignStudioStateService);
    state.patch({
      id: 'c1', registrationOptions: [race5k, race10k],
      // Isolate these tests to participants validation — donor address/id
      // aren't what's being tested here.
      donorFields: { showAddress: false, showPostalCode: false, showIdNumber: false },
    });

    const fixture = TestBed.createComponent(CheckoutModalComponent);
    component = fixture.componentInstance;
    component.draft = state.draft;
    component.checkoutMode = 'registration';
    component.initialOptionId = race5k.id;
    httpMock = TestBed.inject(HttpTestingController);

    component.ngOnInit();
    document.body.style.overflow = ''; // ngOnInit locks body scroll — undo for test hygiene
  });

  afterEach(() => httpMock.verify());

  it('starts with no participants — none are auto-added just by opening the checkout', () => {
    expect(component.participants.length).toBe(0);
  });

  it('addParticipant defaults to the clicked Registration Option, only once explicitly clicked', () => {
    component.addParticipant();
    expect(component.participants.length).toBe(1);
    expect(component.participants[0].optionId).toBe(race5k.id);
    expect(component.participants[0].name).toBe('');
  });

  it('addParticipant/removeParticipant manage the list, always removable down to zero', () => {
    component.addParticipant();
    component.addParticipant();
    expect(component.participants.length).toBe(2);

    component.removeParticipant(0);
    expect(component.participants.length).toBe(1);

    component.removeParticipant(0);
    expect(component.participants.length).toBe(0);
  });

  it('registrationTotal sums each participant\'s chosen option price', () => {
    component.addParticipant();
    component.participants[0].name = 'דנה';
    component.addParticipant();
    component.participants[1].name = 'יוסי';
    component.participants[1].optionId = race10k.id;

    expect(component.registrationTotal).toBe(130);
    expect(component.effectiveAmount).toBe(130);
  });

  it('isValid requires at least one participant, each with a name and an option', () => {
    component.name = 'התורם';
    component.email = 'a@b.com';
    component.phone = '0500000000';
    expect(component.isValid).toBe(false); // no participants yet

    component.addParticipant();
    expect(component.isValid).toBe(false); // participant[0].name still empty

    component.participants[0].name = 'דנה';
    expect(component.isValid).toBe(true);
  });

  it('onSubmit sends one rewards line + one participants entry per participant, with the summed amount', () => {
    component.addParticipant();
    component.participants[0].name = 'דנה';
    component.addParticipant();
    component.participants[1].name = 'יוסי';
    component.participants[1].optionId = race10k.id;

    component.name  = 'התורם המשלם';
    component.email = 'payer@example.com';
    component.phone = '0500000000';

    component.onSubmit();

    const req = httpMock.expectOne(apiUrl);
    expect(req.request.body.amount).toBe(130);
    expect(req.request.body.rewards.length).toBe(2);
    expect(req.request.body.rewards[1].title).toBe('10 ק"מ');
    expect(req.request.body.participants).toEqual([
      { name: 'דנה', registrationOptionId: race5k.id, shirtSize: undefined },
      { name: 'יוסי', registrationOptionId: race10k.id, shirtSize: undefined },
    ]);
    // The payer (donor.name) stays independent from participant names —
    // registering for a group doesn't require the payer to race themselves.
    expect(req.request.body.donor.name).toBe('התורם המשלם');

    req.flush({ id: 'donation1', url: 'https://mock/pay' });
  });

  it('closing without submitting remembers valid participants for later', () => {
    component.addParticipant();
    component.participants[0].name = 'דנה';
    let saved: any = null;
    component.participantsSaved.subscribe((data: any) => (saved = data));

    component.close();

    expect(saved).toEqual({
      participants: [{ name: 'דנה', optionId: race5k.id, shirtSize: '' }],
      total: 50,
    });
  });

  it('closing with no valid participants does not emit participantsSaved', () => {
    let saved: any = null;
    component.participantsSaved.subscribe((data: any) => (saved = data));

    component.close(); // participant[0].name still empty

    expect(saved).toBeNull();
  });

  it('reopening a registration checkout restores a remembered pending registration', () => {
    const reopened = TestBed.createComponent(CheckoutModalComponent).componentInstance;
    reopened.draft = component.draft;
    reopened.checkoutMode = 'registration';
    reopened.pendingRegistration = {
      participants: [{ name: 'דנה', optionId: race5k.id, shirtSize: '' }],
      total: 50,
    };

    reopened.ngOnInit();
    document.body.style.overflow = '';

    expect(reopened.participants).toEqual([{ name: 'דנה', optionId: race5k.id, shirtSize: '' }]);
  });

  it('clearForm resets to zero participants and tells the parent to forget it', () => {
    component.addParticipant();
    component.participants[0].name = 'דנה';
    component.pendingRegistration = { participants: [{ name: 'דנה', optionId: race5k.id, shirtSize: '' }], total: 50 };

    let clearedEmitted = false;
    component.cleared.subscribe(() => (clearedEmitted = true));

    component.clearForm();

    expect(component.participants.length).toBe(0);
    expect(component.pendingRegistration).toBeNull();
    expect(clearedEmitted).toBe(true);
  });

  it('a donation checkout with a pending registration folds it into the same order', () => {
    const donationFixture = TestBed.createComponent(CheckoutModalComponent);
    const donationComponent = donationFixture.componentInstance;
    donationComponent.draft = component.draft;
    donationComponent.checkoutMode = 'donation';
    donationComponent.amount = 100;
    donationComponent.pendingRegistration = {
      participants: [{ name: 'דנה', optionId: race5k.id, shirtSize: '' }],
      total: 50,
    };
    donationComponent.ngOnInit();
    document.body.style.overflow = '';

    expect(donationComponent.effectiveAmount).toBe(150); // 100 donation + 50 registration

    donationComponent.name  = 'התורם המשלם';
    donationComponent.email = 'payer@example.com';
    donationComponent.phone = '0500000000';
    donationComponent.onSubmit();

    const req = httpMock.expectOne(apiUrl);
    expect(req.request.body.amount).toBe(150);
    expect(req.request.body.rewards).toEqual([{ title: '5 ק"מ', minimumAmount: 50 }]);
    expect(req.request.body.participants).toEqual([
      { name: 'דנה', registrationOptionId: race5k.id, shirtSize: undefined },
    ]);

    req.flush({ id: 'donation1', url: 'https://mock/pay' });
  });
});
