package com.superherooo.api.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class ApiController {

    @PostMapping("/contact")
    public ResponseEntity<Map<String, String>> submitContact(@RequestBody Map<String, String> payload) {
        // In a real app, save to DB or send email
        Map<String, String> response = new HashMap<>();
        response.put("status", "success");
        response.put("message", "Thank you, " + payload.getOrDefault("name", "User") + ". We have received your message and will get back to you shortly.");
        return ResponseEntity.ok(response);
    }

    @PostMapping("/auth/login")
    public ResponseEntity<Map<String, String>> login(@RequestBody Map<String, String> payload) {
        // Mock authentication
        Map<String, String> response = new HashMap<>();
        response.put("status", "success");
        response.put("token", "dummy-jwt-token-12345");
        response.put("message", "Login successful");
        return ResponseEntity.ok(response);
    }
    
    @PostMapping("/auth/signup")
    public ResponseEntity<Map<String, String>> signup(@RequestBody Map<String, String> payload) {
        // Mock signup
        Map<String, String> response = new HashMap<>();
        response.put("status", "success");
        response.put("message", "Account created successfully for " + payload.getOrDefault("email", ""));
        return ResponseEntity.ok(response);
    }
    
    @PostMapping("/hero/apply")
    public ResponseEntity<Map<String, String>> applyHero(@RequestBody Map<String, String> payload) {
        // Mock hero application
        Map<String, String> response = new HashMap<>();
        response.put("status", "success");
        response.put("message", "Application submitted! Our team will contact you for the verification process.");
        return ResponseEntity.ok(response);
    }
}
