package com.bandarustock.merchant.controller;

import com.bandarustock.common.enums.MerchantStatus;
import com.bandarustock.merchant.dto.MerchantCreateRequest;
import com.bandarustock.merchant.dto.MerchantResponse;
import com.bandarustock.merchant.dto.MerchantUpdateRequest;
import com.bandarustock.merchant.entity.Merchant;
import com.bandarustock.merchant.service.MerchantService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/merchants")
@RequiredArgsConstructor
public class MerchantController {

    private final MerchantService merchantService;

    /** Backs the Merchant Directory table: search, status/category filters, pagination. */
    @GetMapping
    public Page<MerchantResponse> listMerchants(
            @RequestParam(required = false) String query,
            @RequestParam(required = false) MerchantStatus status,
            @RequestParam(required = false) String category,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "4") int size
    ) {
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        return merchantService.search(query, status, category, pageable)
                .map(MerchantResponse::from);
    }

    @GetMapping("/{id}")
    public MerchantResponse getMerchant(@PathVariable Long id) {
        return MerchantResponse.from(merchantService.getById(id));
    }

    /** Backs the "+ Add Merchant" action. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public MerchantResponse createMerchant(@Valid @RequestBody MerchantCreateRequest request) {
        Merchant created = merchantService.create(request);
        return MerchantResponse.from(created);
    }

    @PatchMapping("/{id}")
    public MerchantResponse updateMerchant(@PathVariable Long id, @Valid @RequestBody MerchantUpdateRequest request) {
        Merchant updated = merchantService.update(id, request);
        return MerchantResponse.from(updated);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteMerchant(@PathVariable Long id) {
        merchantService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
