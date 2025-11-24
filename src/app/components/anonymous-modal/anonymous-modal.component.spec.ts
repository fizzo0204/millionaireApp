import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { AnonymousModalComponent } from './anonymous-modal.component';

describe('AnonymousModalComponent', () => {
  let component: AnonymousModalComponent;
  let fixture: ComponentFixture<AnonymousModalComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [AnonymousModalComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AnonymousModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
