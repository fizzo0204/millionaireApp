import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { DailyRewardModalComponent } from './daily-reward-modal.component';

describe('DailyRewardModalComponent', () => {
  let component: DailyRewardModalComponent;
  let fixture: ComponentFixture<DailyRewardModalComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [DailyRewardModalComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DailyRewardModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
