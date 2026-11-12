package com.bandarustock.merchant.entity;

import com.bandarustock.common.enums.MerchantStatus;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "merchants")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Merchant {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Unique tenant identifier used across the platform (JWT tenantId, routing, etc.). */
    @Column(name = "tenant_id", nullable = false, unique = true, length = 40)
    private String tenantId;

    @Column(name = "merchant_name", nullable = false, length = 150)
    private String merchantName;

    /** Short subtitle shown under the merchant name, e.g. "B2B Hardware". */
    @Column(name = "business_type", length = 100)
    private String businessType;

    @Column(name = "total_products", nullable = false)
    @Builder.Default
    private Integer totalProducts = 0;

    @Column(name = "category", length = 100)
    private String category;

    @Column(name = "monthly_volume", precision = 14, scale = 2)
    @Builder.Default
    private BigDecimal monthlyVolume = BigDecimal.ZERO;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private MerchantStatus status = MerchantStatus.PENDING_REVIEW;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}
