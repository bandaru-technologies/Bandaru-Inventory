package com.bandarustock.merchant.dto;

import com.bandarustock.common.enums.MerchantStatus;

import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;

public record MerchantUpdateRequest(
        String merchantName,
        String businessType,

        @PositiveOrZero(message = "totalProducts must be zero or positive")
        Integer totalProducts,

        String category,

        @PositiveOrZero(message = "monthlyVolume must be zero or positive")
        BigDecimal monthlyVolume,

        MerchantStatus status
) {
}
