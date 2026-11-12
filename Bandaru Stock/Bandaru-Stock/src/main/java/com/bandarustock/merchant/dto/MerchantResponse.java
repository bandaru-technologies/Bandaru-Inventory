package com.bandarustock.merchant.dto;

import com.bandarustock.common.enums.MerchantStatus;
import com.bandarustock.merchant.entity.Merchant;

import java.math.BigDecimal;
import java.time.Instant;

public record MerchantResponse(
        Long id,
        String tenantId,
        String merchantName,
        String businessType,
        Integer totalProducts,
        String category,
        BigDecimal monthlyVolume,
        MerchantStatus status,
        Instant createdAt,
        Instant updatedAt
) {
    public static MerchantResponse from(Merchant m) {
        return new MerchantResponse(
                m.getId(),
                m.getTenantId(),
                m.getMerchantName(),
                m.getBusinessType(),
                m.getTotalProducts(),
                m.getCategory(),
                m.getMonthlyVolume(),
                m.getStatus(),
                m.getCreatedAt(),
                m.getUpdatedAt()
        );
    }
}
