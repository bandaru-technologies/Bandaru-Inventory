package com.bandarustock.merchant.repository;

import com.bandarustock.merchant.entity.Merchant;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface MerchantRepository extends JpaRepository<Merchant, Long>, JpaSpecificationExecutor<Merchant> {

    boolean existsByTenantId(String tenantId);

    Page<Merchant> findAll(org.springframework.data.jpa.domain.Specification<Merchant> spec, Pageable pageable);
}
