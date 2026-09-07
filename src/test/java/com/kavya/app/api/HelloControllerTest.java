package com.kavya.app.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(HelloController.class)
class HelloControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void helloDefaultsToWorld() throws Exception {
        mockMvc.perform(get("/api/hello"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Hello, world!"))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    void helloUsesNameParam() throws Exception {
        mockMvc.perform(get("/api/hello").param("name", "Kavya"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Hello, Kavya!"));
    }
}
