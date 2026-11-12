package com.bandarustock.merchant.service;

import com.bandarustock.common.enums.MerchantStatus;
import com.bandarustock.common.exception.MerchantNotFoundException;
import com.bandarustock.merchant.dto.MerchantCreateRequest;
import com.bandarustock.merchant.dto.MerchantUpdateRequest;
import com.bandarustock.merchant.entity.Merchant;
import com.bandarustock.merchant.repository.MerchantRepository;

import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class MerchantService {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final MerchantRepository merchantRepository;

    public Page<Merchant> search(String query, MerchantStatus status, String category, Pageable pageable) {
        Specification<Merchant> spec = buildSpecification(query, status, category);
        return merchantRepository.findAll(spec, pageable);
    }

    public Merchant getById(Long id) {
        return merchantRepository.findById(id)
                .orElseThrow(() -> new MerchantNotFoundException(id));
    }

    public Merchant create(MerchantCreateRequest request) {
        Merchant merchant = Merchant.builder()
                .tenantId(generateTenantId())
                .merchantName(request.merchantName())
                .businessType(request.businessType())
                .totalProducts(request.totalProducts() != null ? request.totalProducts() : 0)
                .category(request.category())
                .monthlyVolume(request.monthlyVolume())
                .status(request.status() != null ? request.status() : MerchantStatus.PENDING_REVIEW)
                .build();
        return merchantRepository.save(merchant);
    }

    public Merchant update(Long id, MerchantUpdateRequest request) {
        Merchant merchant = getById(id);
        if (StringUtils.hasText(request.merchantName())) {
            merchant.setMerchantName(request.merchantName());
        }
        if (request.businessType() != null) {
            merchant.setBusinessType(request.businessType());
        }
        if (request.totalProducts() != null) {
            merchant.setTotalProducts(request.totalProducts());
        }
        if (request.category() != null) {
            merchant.setCategory(request.category());
        }
        if (request.monthlyVolume() != null) {
            merchant.setMonthlyVolume(request.monthlyVolume());
        }
        if (request.status() != null) {
            merchant.setStatus(request.status());
        }
        return merchantRepository.save(merchant);
    }

    public void delete(Long id) {
        Merchant merchant = getById(id);
        merchantRepository.delete(merchant);
    }

    private Specification<Merchant> buildSpecification(String query, MerchantStatus status, String category) {
        return (root, criteriaQuery, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            if (StringUtils.hasText(query)) {
                String like = "%" + query.toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("merchantName")), like),
                        cb.like(cb.lower(root.get("tenantId")), like),
                        cb.like(cb.lower(root.get("category")), like)
                ));
            }
            if (status != null) {
                predicates.add(cb.equal(root.get("status"), status));
            }
            if (StringUtils.hasText(category)) {
                predicates.add(cb.equal(cb.lower(root.get("category")), category.toLowerCase()));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private String generateTenantId() {
        int number = 1000 + RANDOM.nextInt(9000);
        return "TEN-" + number;
    }
}
