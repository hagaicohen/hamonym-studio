// src/app/core/services/entities.service.ts

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface EntityNotification {
  id: number;
  action: 'approve' | 'reject' | 'request_changes' | 'suspend' | 'reactivate';
  notes: string | null;
  reasonTags: string[];
  createdAt: string;
  actorName: string;
}

@Injectable({
  providedIn: 'root',
})
export class EntitiesService {
  public http = inject(HttpClient);

  createEntity(data: any): Observable<any> {
    return this.http.post(
      `${environment.apiUrl}/api/entities`,

      {
        // =========================
        // BASIC
        // =========================

        entity_type: data.entity_type,

        legal_name: data.legal_name,

        display_name: data.display_name,

        registration_number: data.registration_number,

        email: data.email,

        phone: data.phone,

        website: data.website,

        description: data.description,

        logo_url: data.logo_url,

        is_profile_complete: data.is_profile_complete,

        primary_category: data.primary_category,

        secondary_categories: data.secondary_categories,

        campaign_types: data.campaign_types,

        // =========================
        // GOALS
        // =========================

        monthly_goal: data.monthly_goal,

        yearly_goal: data.yearly_goal,

        // =========================
        // CARDCOM
        // =========================

        billing_provider: data.billing_provider,

        billing_skip_setup: data.billing_skip_setup,

        cardcom_terminal_number: data.cardcom_terminal_number,

        cardcom_api_username: data.cardcom_api_username,

        cardcom_api_password_encrypted: data.cardcom_api_password_encrypted,

        cardcom_connection_status: data.cardcom_connection_status,

        //BILLING
        billing_method: data.billing_method,

        billing_holder_name: data.billing_holder_name,

        billing_card_last4: data.billing_card_last4,

        billing_card_expiry: data.billing_card_expiry,

        billing_masav_file_name: data.billing_masav_file_name,

        billing_status: data.billing_status,

        // =========================
        // CONTACT
        // =========================

        contact_full_name: data.contact_full_name,

        contact_phone: data.contact_phone,

        contact_email: data.contact_email,

        // =========================
        // DOCUMENTS
        // =========================

        association_certificate_url: data.association_certificate_url,

        association_certificate_name: data.association_certificate_name,

        tax_document_url: data.tax_document_url,

        tax_document_name: data.tax_document_name,
      },

      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      },
    );
  }

  //update entitiy goes here...
  updateEntity(entityId: string, data: any): Observable<any> {
    return this.http.patch(
      `${environment.apiUrl}/api/entities/${entityId}`,
      data,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      },
    );
  }

  getEntityById(entityId: string): Observable<any> {
    return this.http.get(
      `${environment.apiUrl}/api/entities/${entityId}`,

      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      },
    );
  }

  getMyEntities(): Observable<any> {
    return this.http.get(
      `${environment.apiUrl}/api/entities/my`,

      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      },
    );
  }

  // Partner Draft — Page Builder Owner Context (Phase 3)
  getDraft(entityId: string): Observable<{ blocks: any[]; layout: any }> {
    return this.http.get<{ blocks: any[]; layout: any }>(
      `${environment.apiUrl}/api/entities/${entityId}/draft`,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      },
    );
  }

  updateDraft(entityId: string, data: { blocks: any[]; layout: any }): Observable<{ blocks: any[]; layout: any }> {
    return this.http.patch<{ blocks: any[]; layout: any }>(
      `${environment.apiUrl}/api/entities/${entityId}/draft`,
      data,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      },
    );
  }

  // Public Partner Page — Phase 5, Sprint 5.1. No auth header — this must
  // work for anonymous visitors.
  getPublicPartner(entityId: string): Observable<{ displayName: string; logoUrl: string | null; blocks: any[]; layout: any }> {
    return this.http.get<{ displayName: string; logoUrl: string | null; blocks: any[]; layout: any }>(
      `${environment.apiUrl}/api/entities/${entityId}/public`,
    );
  }

  // Entity Roles — Phase 2 (Partner Domain Model)
  addRole(entityId: string, role: 'organization' | 'partner'): Observable<{ roles: string[] }> {
    return this.http.post<{ roles: string[] }>(
      `${environment.apiUrl}/api/entities/${entityId}/roles`,
      { role },
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      },
    );
  }

  // Partner Search — Phase 4 (Discovery)
  searchPartners(q: string): Observable<{ partners: { id: string; display_name: string; logo_url: string | null; website: string | null }[] }> {
    return this.http.get<{ partners: any[] }>(
      `${environment.apiUrl}/api/entities/search-partners`,
      {
        params: { q: q || '' },
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      },
    );
  }

  // Partner Invite — Phase 4 (Epic 3)
  createInvite(entityId: string, email: string): Observable<{ email: string; expiresAt: string }> {
    return this.http.post<{ email: string; expiresAt: string }>(
      `${environment.apiUrl}/api/entities/${entityId}/invites`,
      { email },
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      },
    );
  }

  getInvite(token: string): Observable<{ email: string; entityName: string }> {
    return this.http.get<{ email: string; entityName: string }>(
      `${environment.apiUrl}/api/invites/${token}`,
    );
  }

  acceptInvite(token: string): Observable<{ entityId: string }> {
    return this.http.post<{ entityId: string }>(
      `${environment.apiUrl}/api/invites/${token}/accept`,
      {},
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      },
    );
  }

  uploadAssociationDocument(entityId: string, file: File): Observable<any> {
    const formData = new FormData();

    formData.append('file', file);

    return this.http.patch(
      `${environment.apiUrl}/api/entities/${entityId}/association-document`,

      formData,

      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      },
    );
  }

  uploadTaxDocument(entityId: string, file: File): Observable<any> {
    const formData = new FormData();

    formData.append('file', file);

    return this.http.patch(
      `${environment.apiUrl}/api/entities/${entityId}/tax-document`,

      formData,

      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      },
    );
  }

  getAssociationDocumentUrl(entityId: string): string {
    return `${environment.apiUrl}/api/entities/${entityId}/association-document`;
  }

  getTaxDocumentUrl(entityId: string): string {
    return `${environment.apiUrl}/api/entities/${entityId}/tax-document`;
  }

  uploadLogo(entityId: string, file: File): Observable<any> {
    const formData = new FormData();

    formData.append('file', file);

    return this.http.patch(
      `${environment.apiUrl}/api/entities/${entityId}/logo`,

      formData,

      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      },
    );
  }

  removeTaxDocument(entityId: string) {
    return this.http.delete(
      `${environment.apiUrl}/api/entities/${entityId}/tax-document`,
    );
  }

  removeAssociationDocument(entityId: string) {
    return this.http.delete(
      `${environment.apiUrl}/api/entities/${entityId}/association-document`,
      { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } },
    );
  }

  getApprovalStatus(entityId: string): Observable<any> {
    return this.http.get(
      `${environment.apiUrl}/api/entities/${entityId}/approval-status`,
      { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } },
    );
  }

  getNotifications(entityId: string): Observable<{ notifications: EntityNotification[] }> {
    return this.http.get<{ notifications: EntityNotification[] }>(
      `${environment.apiUrl}/api/entities/${entityId}/notifications`,
      { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } },
    );
  }

  acknowledgeNotifications(entityId: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(
      `${environment.apiUrl}/api/entities/${entityId}/notifications/acknowledge`,
      {},
      { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } },
    );
  }

  requestReview(entityId: string): Observable<any> {
    return this.http.patch(
      `${environment.apiUrl}/api/entities/${entityId}/request-review`,
      {},
      { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } },
    );
  }

  // Soft delete — the entity and all its campaigns disappear immediately
  // (deleted_at set); permanent removal is a platform-admin-only action.
  deleteEntity(entityId: string): Observable<any> {
    return this.http.delete(
      `${environment.apiUrl}/api/entities/${entityId}`,
      { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } },
    );
  }

  // Reversible hide/unhide. Hiding cascades to hide the entity's campaigns
  // too; unhiding the entity does not restore campaigns hidden separately.
  setVisibility(entityId: string, isHidden: boolean): Observable<any> {
    return this.http.patch(
      `${environment.apiUrl}/api/entities/${entityId}/visibility`,
      { is_hidden: isHidden },
      { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } },
    );
  }
}
