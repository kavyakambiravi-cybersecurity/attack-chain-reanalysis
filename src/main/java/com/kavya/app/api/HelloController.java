package com.kavya.app.api;

import java.time.Instant;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class HelloController {

    public record HelloResponse(String message, Instant timestamp) {
    }

    @GetMapping("/hello")
    public HelloResponse hello(@RequestParam(defaultValue = "world") String name) {
        return new HelloResponse("Hello, " + name + "!", Instant.now());
    }
}
